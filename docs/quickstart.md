<!--
Copyright 2024 Deutsche Telekom IT GmbH

SPDX-License-Identifier: Apache-2.0
-->

# Local installation (Quickstart)

> ### We are currently working on an updated version of our documentation.
>
>**Please refer to the following tags in the meantime**
> 
>| Component                                                        | Version                                                                         |
>|------------------------------------------------------------------|---------------------------------------------------------------------------------|
>| [Starlight](https://github.com/telekom/pubsub-horizon-starlight) | [4.0.1](https://github.com/telekom/pubsub-horizon-starlight/releases/tag/4.0.1) |
>| [Galaxy](https://github.com/telekom/pubsub-horizon-galaxy)       | [4.0.2](https://github.com/telekom/pubsub-horizon-galaxy/releases/tag/4.0.2)    |
>| [Comet](https://github.com/telekom/pubsub-horizon-comet)         | [4.0.1](https://github.com/telekom/pubsub-horizon-comet/releases/tag/4.0.1)     |
>| [Polaris](https://github.com/telekom/pubsub-horizon-polaris)     | [4.0.3](https://github.com/telekom/pubsub-horizon-polaris/releases/tag/4.0.3)   |
>| [Vortex](https://github.com/telekom/pubsub-horizon-vortex)       | [1.4.2](https://github.com/telekom/pubsub-horizon-vortex/releases/tag/1.4.2)    |
>| [Pulsar](https://github.com/telekom/pubsub-horizon-pulsar)       | [4.0.0](https://github.com/telekom/pubsub-horizon-pulsar/releases/tag/4.0.0)    |


This guide describes how to install Horizon using `k3d`/`k3s`. It is intended for development and testing purposes only.

> **Warning:** Do not use it for installation on productive environments!

> **Important:** This guide uses non-productive example passwords for simplification, please change them accordingly!

If you do not know what k3d is, please refer to the [k3d documentation](https://k3d.io/).  
By following this quickstarter guide line by line, you will obtain an running instance of Horizon that you can use to try out the software.

>*This guide has been written for and tested with k3d version v5.6.0, k3s version v1.27.4-k3s1, kubernetes version v1.27.4, and Helm version v3.14.1 on Microsoft Windows 10 (x64) with Docker Desktop version 4.28.0.*


## System requirements

* Microsoft Windows 10 (x64) or later
* Docker Desktop installed
* At least 6 GB free RAM recommended

    If needed, limit the memory usage of Docker Desktop when creating/adjusting the `%USERPROFILE%/.wsl2config`:
    ```
    [wsl2]
    memory=6GB
    ````


## Prepare the environment

* Install `scoop` CLI package manager:  
    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    ```

* Install required tools via `scoop` package manager:
    ```powershell
    scoop install k3d helm yq openssl
    ```

    This will install:

    * `yq`: A yaml processing CLI util
    * `k3d`: Used for easily creating a new Kubernetes cluster locally
    * `helm`: Used for installing software (here: Horizon) in the Kubernetes cluster


* Create a new directory as workspace on your local machine:
    ```powershell
    New-Item -Path horizon -ItemType Directory; Set-Location -Path horizon
    ```
* Clone the following repositories:
    ```powershell
    git clone https://github.com/telekom/pubsub-horizon.git
    git clone https://github.com/telekom/pubsub-horizon-starlight.git --branch 4.0.1
    git clone https://github.com/telekom/pubsub-horizon-galaxy.git --branch 4.0.2
    git clone https://github.com/telekom/pubsub-horizon-comet.git --branch 4.0.1
    git clone https://github.com/telekom/pubsub-horizon-polaris.git --branch 4.0.3
    git clone https://github.com/telekom/pubsub-horizon-vortex.git --branch 1.4.2
    git clone https://github.com/telekom/pubsub-horizon-pulsar.git --branch 4.0.0

    ```

## Prepare the cluster

For this guide we will use a [`k3s`](https://k3s.io/) Kubernetes cluster which will install by using [`k3d`](https://k3d.io/).  

> `k3s` works slightly differently to Minikube. For example, it uses the [Traefik Ingress Controller](https://docs.k3s.io/networking#traefik-ingress-controller) instead of an Ingress Controller based on Nginx. This detail will become relevant later when we want to replace the default self-signed certificate of the loadbalancer.

* Initialize a new Kubernetes cluster:
    ```powershell
    k3d cluster create horizon-playground -p "443:443@loadbalancer" -p "80:80@loadbalancer" --agents 2
    ```

* Create a new kubeconfig file for the new cluster:
    ```powershell
    k3d kubeconfig get horizon-playground > $env:userprofile\horizon-playground.kubeconfig
    ```

* Set the new kubeconfig as default:
    ```powershell
    $env:KUBECONFIG = "$env:userprofile\horizon-playground.kubeconfig"
    ```

* Install an [ingress dns](https://github.com/talss89/kube-ingress-dns) for resolving ingress URLs within the cluster:
    ```powershell
    kubectl apply -f https://raw.githubusercontent.com/talss89/kube-ingress-dns/main/manifest/ingress-dns.yaml
    kubectl apply -f .\pubsub-horizon\resources\ingress-dns.yaml

    ```

    >*Special thanks to [Tom Lawton](https://github.com/talss89) who created this rewrite of minikube-ingress-dns which works with any Kubernetes cluster.*

* Customize the CoreDNS configuration:

    In order to point CoreDNS to our Ingress DNS for resolving any request with *.test host, we must [customize the CoreDNS configuration](https://docs.digitalocean.com/products/kubernetes/how-to/customize-coredns/).  
    
    Basically, it is sufficient to add a similar entry as follows:
    ```
    test:53 {
        errors
        cache 30
        forward . <Cluster IP of kube-ingress-dns service>
    }
    ```

    You can easily prepare such a configuration by running the following Powershell commands, which will also set the correct cluster IP of the Ingress DNS:

    ```powershell
    $clusterIP = kubectl get -n kube-system service/kube-ingress-dns -o jsonpath="{.spec.clusterIP}"
    $yamlFile = ".\examples\coredns-custom.yaml"
    $yamlContent = Get-Content $yamlFile
    $yamlContent -replace "<Cluster IP of kube-ingress-dns service>", $clusterIP | Set-Content $yamlFile

    ```

    Finally, install the custom CoreDNS configuration:
    
    ```powershell
    kubectl apply -f .\examples\coredns-custom.yaml -n kube-system
    ```

    After that the CoreDNS should reload itself. You can verify it by using the following command:

    ```powershell
    kubectl logs -n kube-system -l k8s-app=kube-dns
    ```

* Create a new "platform" namespace in the cluster:
    ```powershell
    kubectl create namespace platform
    ```

### Create a self-signed certificate

Since some of the Horizon components will later establish a secure connection to the IDP, a self-signed CA certificate with the common name (CN) `*.test` must be created first, which will be imported later into the truststore of the individual Horizon components.  

>*This step is particularly important if, as in this case, we are installing the Open Telekom Integration Platform locally and are not using a registered domain with a valid ROOT CA certificate.*

* Create a private key first:
    ```powershell
    openssl genpkey -algorithm RSA -out private.key
    ```

* Create a Certificate Signing Request (CSR):
    ```powershell
    openssl req -new -key private.key -out wildcard.test.csr
    ```

* Create a self-signed wild-card certificate for *.test:
    ```powershell
    openssl x509 -req -days 365 -in wildcard.test.csr -signkey private.key -out wildcard.test.crt
    ```

    > Make sure to set `*.test` for the common name (CN) when asked. Any other question can be skipped (answered with `.`).

* Configure the Traefik proxy to use the new certificate:

    ```powershell
    kubectl create secret tls tls-secret --cert=.\wildcard.test.crt --key=.\private.key -n platform
    kubectl apply -f .\pubsub-horizon\examples\traefik-tlsstore.yaml -n platform
    ```


## Install Horizon

### Install dependencies

* Install Kafka:
    ```powershell
    helm install horizon-kafka oci://registry-1.docker.io/bitnamicharts/kafka -f .\pubsub-horizon\examples\kafka-sample-values.yaml -n platform --version 26.11.4
    ```

    Verify ready status of Kafka
    ```powershell
    while (1) {kubectl get sts horizon-kafka-controller -n platform; sleep 5}
    ```
    >*The command above will be executed every 5 seconds. It can take a few minutes until Kafka is ready.*

* Install MongoDB:
    ```powershell
    helm install --set auth.rootPassword=topsecret horizon-mongodb oci://registry-1.docker.io/bitnamicharts/mongodb-sharded -n platform --version 7.8.1
    ```

    Verify ready status of MongoDB
    ```powershell
    while (1) {kubectl get sts -l app.kubernetes.io/name=mongodb-sharded -n platform; sleep 5}
    ```
    >*The command above will be executed every 5 seconds. It can take a few minutes until MongoDB is ready.*

### Configure the database

* Start a new process for port-forwarding the MongoDB service to your local machine:
    ```powershell
    Start-Process kubectl -ArgumentList "port-forward -n platform service/horizon-mongodb-mongodb-sharded 27017:27017"
    ```

    >**Note:** A new terminal will popup. Do not close it unless you want to terminate the port-forwarding. Let's continue in the original Poershell terminal

    
* Initialize the database and create required indices:
    ```powershell
    mongosh -u root -p topsecret --file .\pubsub-horizon\examples\init-database.js
    ```
### Install CRDs

* Install required Horizon custom resource definitions (CRDs):
    ```powershell
    kubectl apply -f .\pubsub-horizon\resources\crds.yaml
    ```

* Install required ServiceMonitor CRD:
    ```powershell
    kubectl apply -f https://raw.githubusercontent.com/prometheus-community/helm-charts/main/charts/kube-prometheus-stack/charts/crds/crds/crd-servicemonitors.yaml
    ```

### Install headless services

* Install required Horizon headless services:
    ```powershell
    kubectl apply -f .\pubsub-horizon\resources\services.yaml -n platform
    ```

### Build the images

* Copy the wildcard certificate previously created to the necessary places:
    ```powershell
    cp wildcard.test.crt .\pubsub-horizon-starlight\cacert.crt
    cp wildcard.test.crt .\pubsub-horizon-comet\cacert.crt
    cp wildcard.test.crt .\pubsub-horizon-polaris\cacert.crt
    cp wildcard.test.crt .\pubsub-horizon-pulsar\cacert.crt

    ```

    > **Note:** This step is not necessary for every application, but only for the applications that communicate with the IDP

* Build all Horizon images (this can take a few minutes):
    ```powershell
    docker build --build-arg="BUILD_ENV=with_cacert" -t horizon-starlight:latest -f .\pubsub-horizon-starlight\Dockerfile.multi-stage .\pubsub-horizon-starlight
    docker build -t horizon-galaxy:latest -f .\pubsub-horizon-galaxy\Dockerfile.multi-stage .\pubsub-horizon-galaxy
    docker build --build-arg="BUILD_ENV=with_cacert" -t horizon-comet:latest -f .\pubsub-horizon-comet\Dockerfile.multi-stage .\pubsub-horizon-comet
    docker build --build-arg="BUILD_ENV=with_cacert" -t horizon-polaris:latest -f .\pubsub-horizon-polaris\Dockerfile.multi-stage .\pubsub-horizon-polaris
    docker build --build-arg="BUILD_ENV=with_cacert" -t horizon-pulsar:latest -f .\pubsub-horizon-pulsar\Dockerfile.multi-stage .\pubsub-horizon-pulsar
    docker build -t horizon-vortex:latest -f .\pubsub-horizon-vortex\Dockerfile .\pubsub-horizon-vortex

    ```

* Import the images into the Kubernetes cluster (this can take a few minutes):
    ```powershell
    k3d image import docker.io/library/horizon-starlight:latest -c horizon-playground
    k3d image import docker.io/library/horizon-galaxy:latest -c horizon-playground
    k3d image import docker.io/library/horizon-comet:latest -c horizon-playground
    k3d image import docker.io/library/horizon-polaris:latest -c horizon-playground
    k3d image import docker.io/library/horizon-pulsar:latest -c horizon-playground
    k3d image import docker.io/library/horizon-vortex:latest -c horizon-playground

    ```
## Configure the identity provider

If you have not yet installed an identity provider in the cluster, you can do so at this point by installing Iris:

<details>
<summary>Install the IDP</summary>
<br />

* Clone the required repositories:
    ```powershell
    git clone https://github.com/telekom/identity-iris-keycloak-image.git
    git clone https://github.com/telekom/identity-iris-keycloak-charts.git

    ```

* Build the image:
    ```powershell
    docker build -t iris_keycloak:latest -f .\identity-iris-keycloak-image\Dockerfile.multi-stage .\identity-iris-keycloak-image
    ```

* Import the image into the cluster:
    ```powershell
    k3d image import docker.io/library/iris_keycloak:latest -c horizon-playground
    ```

* Required for k3d/k3s: Set the StorageClass name to "local-path":
    ```powershell
    yq -i '.postgresql.persistence.storageClassName = \"local-path\"' .\identity-iris-keycloak-charts\values.local.yaml
    ```

* Install the IDP:
    ```powershell
    helm upgrade -i -n platform -f .\identity-iris-keycloak-charts\values.local.yaml iris .\identity-iris-keycloak-charts\
    ```

* Add a new entry to your `C:\Windows\System32\Drivers\etc\hosts` file, so that the IDP can be accessed from the host system:  
    ```text
    127.0.0.1 iris.test
    ```
    > **Note:** This needs administrative rights.

</details>

#### Configuration

* Follow the instruction of the [Configure the identity provider](https://github.com/telekom/Open-Telekom-Integration-Platform/wiki/Installation-on-Minikube#configure-the-identity-provider) section.

* Create another new client with the name "eventstore". You may use the import client feature to import the client configuration below:

    <details>
    <summary>eventstore-client.json</summary>

    ```json
    {
        "clientId": "eventstore",
        "name": "eventstore",
        "surrogateAuthRequired": false,
        "enabled": true,
        "alwaysDisplayInConsole": false,
        "clientAuthenticatorType": "client-secret",
        "secret": "N25V3loiXgc8USBmoX0AVXmnb3gIs0N6",
        "redirectUris": [],
        "webOrigins": [],
        "notBefore": 0,
        "bearerOnly": false,
        "consentRequired": false,
        "standardFlowEnabled": false,
        "implicitFlowEnabled": false,
        "directAccessGrantsEnabled": false,
        "serviceAccountsEnabled": true,
        "publicClient": false,
        "frontchannelLogout": false,
        "protocol": "openid-connect",
        "attributes": {},
        "authenticationFlowBindingOverrides": {},
        "fullScopeAllowed": false,
        "nodeReRegistrationTimeout": -1,
        "protocolMappers": [
            {
                "name": "Client Host",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usersessionmodel-note-mapper",
                "consentRequired": false,
                "config": {
                    "user.session.note": "clientHost",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "claim.name": "clientHost",
                    "jsonType.label": "String"
                }
            },
            {
                "name": "Client IP Address",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usersessionmodel-note-mapper",
                "consentRequired": false,
                "config": {
                    "user.session.note": "clientAddress",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "claim.name": "clientAddress",
                    "jsonType.label": "String"
                }
            },
            {
                "name": "Client ID",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usersessionmodel-note-mapper",
                "consentRequired": false,
                "config": {
                    "user.session.note": "clientId",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "claim.name": "clientId",
                    "jsonType.label": "String"
                }
            }
        ],
        "defaultClientScopes": [
            "web-origins",
            "client-origin",
            "profile",
            "roles",
            "email"
        ],
        "optionalClientScopes": [
            "address",
            "phone",
            "open-telekom-integration-platform",
            "offline_access",
            "microprofile-jwt"
        ],
        "access": {
            "view": true,
            "configure": true,
            "manage": true
        }
    }
    ```

    </details>

    > *Of course you can also change the secret, but for the sake of simplicity we recommend leaving it as it is for this non-productive installation of Horizon.*

## Horizon installation

1. Create a new `horizon-nonprod-customized.yaml` file where the secret for  "eventstore" client is properly set to the value configured in the step before:
    ```powershell
    yq -i '.global.commonHorizon.iris.clientSecret = \"default=N25V3loiXgc8USBmoX0AVXmnb3gIs0N6\"' .\pubsub-horizon\examples\horizon-nonprod.yaml
    ```

2. Install Horizon
    ```powershell
    helm upgrade -i -n platform -f .\horizon-nonprod.yaml horizon oci://ghcr.io/telekom/o28m-charts/horizon-all --version 1.0.0-ci-semantic-release
    ```

## Try it out

### Prerequisites

* Install [Insomnium](https://github.com/ArchGPT/insomnium), a privacy-focused open-source tool for testing APIs:
    ```powershell
    scoop bucket add extras
    scoop install extras/insomnium
    ```

* Clone Cosmoparrot echo service:
    ```powershell
    git clone https://github.com/telekom/pubsub-horizon-cosmoparrot.git
    ```
* Build the Cosmoparrot image:
    ```powershell
    docker build -t cosmoparrot:latest -f .\pubsub-horizon-cosmoparrot\Dockerfile .\pubsub-horizon-cosmoparrot
    ```
* Import the Cosmoparrot image into the cluster:
    ```powershell
    k3d image import docker.io/library/cosmoparrot:latest -c horizon-playground
    ```
* Install Cosmoparrot:
    ```powershell
    kubectl apply -f .\pubsub-horizon-cosmoparrot\manifest\deployment.yaml -n platform
    ```
* Port-forward Horizon Starlight:
    ```powershell
    Start-Process kubectl -ArgumentList "port-forward -n platform service/horizon-starlight 8080:8080"
    ```

### Create a new publisher/consumer client

Just like before, you must first create a new client, but this time not for internal systems, but for the event provider and event consumer.  
In this example, we will keep it simple, which is why the event provider is also the event consumer - so you will only need to create one client.

* Create a new client within the "default" realm with the name "ecommerce--billing--order-processing". You can easily import [examples/example-client.json](../examples/example-client.json) for this step. It also contains a password that we will use later.

### Create a callback subscription

* Apply the example subscription:
    ```powershell
    kubectl apply -f .\pubsub-horizon\examples\example-subscription.yaml -n platform
    ```

    > This will create a new subscription for the eventType "orders.v1" and the consumer "ecommerce--billing--order-processing". The callback URL points to the internal Kubernetes service URL "http://cosmoparrot.platform:8080/callback" (our echo seervice).

### Send an event

1. Start Insomnium
   > **Important:** Make sure to disable certificate validation in Insomnium during this test, since the CA certificate used for https://iris.test is still a self-signed one. You can do so by navigating to `Application -> Preferences` and untick the option "Validate certificates during authentication".
3. Create a new `POST` HTTP request for the URL `http://localhost:8080/v1/nonprod/events`
4. Set `OAuth 2` as auth type.
6. Set `Client Credentials` as grant type.
7. For the access token URL use: https://iris.test/auth/realms/default/protocol/openid-connect/token
8. Set "ecommerce--billing--order-processing" as client ID.
9. Set "75DdRxQpcWUMKpAajw5OmSW8U3CnXg2p" as client secret.
10. Add the following JSON body:
    ```json
    {
    "id":"b5882acc-e40e-47c4-b767-079d310f1ec0",
    "source":"http://apihost/some/path/resource/1234",
    "specversion":"1.0",
    "type":"orders.v1",
    "datacontenttype":"application/json",
    "dataref":"http://apihost/some/api/v1/resource/1234",
    "data":{
        "orderNumber":"123"
    },
    "dataschema":"http://apihost/schema/definition.json"
    }
    ```

    *Make sure to use a new UUID for the `id` field (=event ID) everytime yo make a request.*

    > **Tip:** You can use the internal `UUID` (v4) function of Insomnium to generate a proper UUID for the `id` field. 

11. Execute the request, you should see a `201` HTTP response code

### Verify event has been received

* Verify the callback request reached the event consumer by viewing the logs of Cosmoparrot:
    ```powershell
    kubectl logs -l app=cosmoparrot -n platform
    ```

