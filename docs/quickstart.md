# Local installation (Quickstart)

This guide describes how to install Horizon using `k3d`. It is intended for development and testing purposes only. **Do not use it for installation on productive environments!**  

If you do not know what k3d is, please refer to the [k3d documentation](https://k3d.io/).  
By following this quickstarter guide line by line, you will obtain an running instance of Horizon that you can use to try out the software.

*This guide has been written for and tested with k3d version v5.6.0, k3s version v1.27.4-k3s1, kubernetes version v1.27.4, and Helm version v3.14.1 on Microsoft Windows 10 (x64) with Docker Desktop version 4.28.0.*

## Prepare the environment

* Install `scoop` CLI package manager:  
    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    ```

* Install required tools via `scoop` package manager:
    ```powershell
    scoop install k3d helm yq
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
    git clone https://github.com/telekom/pubsub-horizon-helm-charts.git
    git clone https://github.com/telekom/pubsub-horizon-starlight.git
    git clone https://github.com/telekom/pubsub-horizon-galaxy.git
    git clone https://github.com/telekom/pubsub-horizon-comet.git
    git clone https://github.com/telekom/pubsub-horizon-polaris.git
    git clone https://github.com/telekom/pubsub-horizon-vortex.git
    git clone https://github.com/telekom/pubsub-horizon-pulsar.git
    ```

## Prepare the cluster

For this guide we will use a [`k3s`](https://k3s.io/) Kubernetes cluster which will install by using [`k3d`](https://k3d.io/).  

*If you already prepared a Kubernetes cluster by following the [Open Telekom Integration Platform on minikube](https://github.com/telekom/Open-Telekom-Integration-Platform/wiki/Installation-on-Minikube) guide, you can skip this section and jump directly to [Install Horizon](#install-horizon).*

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

    *Special thanks to [Tom Lawton](https://github.com/talss89) who created this rewrite of minikube-ingress-dns which works with any Kubernetes cluster.*

* Edit the `coredns` ConfigMap:

    Run the following

    ```powershell
    kubectl edit configmap coredns -n kube-system
    ```

    Add the following configuration and save the file:
    ```
    test:53 {
        errors
        cache 30
        forward . <Cluster IP of kube-ingress-dns service>
    }
    ```

    *Note, you can find the correct Cluster IP easily by running:*
    
    ```powershell
    kubectl get -n kube-system service/kube-ingress-dns -o jsonpath="{.spec.clusterIP}"
    ```
* Restart the `coredns` deployment:

    ```powershell
    kubectl rollout restart deployment coredns -n kube-system
    ```

* Create a new "platform" namespace in the cluster:
    ```powershell
    kubectl create namespace platform
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
    *The command above will be executed every 5 seconds. It can take a few minutes until Kafka is ready.*

* Install MongoDB:
    ```powershell
    helm install --set auth.rootPassword=topsecret horizon-mongodb oci://registry-1.docker.io/bitnamicharts/mongodb-sharded -n platform --version 7.8.1
    ```

    Verify ready status of MongoDB
    ```powershell
    while (1) {kubectl get sts -l app.kubernetes.io/name=mongodb-sharded -n platform; sleep 5}
    ```
    *The command above will be executed every 5 seconds. It can take a few minutes until MongoDB is ready.*

### Configure the database

* Start a new process for port-forwarding the MongoDB service to your local machine:
    ```powershell
    Start-Process kubectl -ArgumentList "port-forward -n platform service/horizon-mongodb-mongodb-sharded 27017:27017"
    ```

    *Note: A new terminal will popup. Do not close it unless you want to terminate the port-forwarding. Let's continue in the original Poershell terminal*

    
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

* Build all Horizon images (this can take a few minutes):
    ```powershell
    docker build -t horizon-starlight:latest -f .\pubsub-horizon-starlight\Dockerfile.multi-stage .\pubsub-horizon-starlight
    docker build -t horizon-galaxy:latest -f .\pubsub-horizon-galaxy\Dockerfile.multi-stage .\pubsub-horizon-galaxy
    docker build -t horizon-comet:latest -f .\pubsub-horizon-comet\Dockerfile.multi-stage .\pubsub-horizon-comet
    docker build -t horizon-polaris:latest -f .\pubsub-horizon-polaris\Dockerfile.multi-stage .\pubsub-horizon-polaris
    docker build -t horizon-vortex:latest -f .\pubsub-horizon-vortex\Dockerfile .\pubsub-horizon-vortex
    docker build -t horizon-pulsar:latest -f .\pubsub-horizon-pulsar\Dockerfile.multi-stage .\pubsub-horizon-pulsar
    ```

* Import the images into the Kubernetes cluster (this can take a few minutes):
    ```powershell
    k3d image import docker.io/library/horizon-starlight:latest -c horizon-playground
    k3d image import docker.io/library/horizon-galaxy:latest -c horizon-playground
    k3d image import docker.io/library/horizon-comet:latest -c horizon-playground
    k3d image import docker.io/library/horizon-polaris:latest -c horizon-playground
    k3d image import docker.io/library/horizon-vortex:latest -c horizon-playground
    k3d image import docker.io/library/horizon-pulsar:latest -c horizon-playground
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
    docker build -t iris:latest -f .\identity-iris-keycloak-image\Dockerfile.multi-stage .\identity-iris-keycloak-image
    ```

* Import the image into the cluster:
    ```powershell
    k3d image import docker.io/library/iris:latest -c horizon-playground
    ```

* Required for k3d/k3s: Set the StorageClass name to "local-path":
    ```powershell
    yq -i '.postgresql.persistence.storageClassName = \"local-path\"' .\identity-iris-keycloak-charts\values.local.yaml
    ```
* Install the IDP:
    ```powershell
    helm upgrade -i -n platform f .\identity-iris-keycloak-charts\values.local.yaml iris .\identity-iris-keycloak-charts\
    ```
</details>

#### Configuration

* Retrieve the admin password of Iris IDP:
    ```
    kubectl get secret -n platform iris -o jsonpath="{.data.adminPassword}" | %{[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_))}
    ```

* Open the Keycloak admin console in your browser: https://iris.test/auth/admin/. Since it is a self-signed certificate for local testing purposes, you need to accept the certificate warning.

* Login with the username admin and the password retrieved above.

* Create a new client named eventstore. You may use the import client feature to import the client configuration below:

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
    "protocolMappers":
    [
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
    *Of course, you can change the secret to your likings.*
    </details>


## Horizon installation

1. Create a new `horizon-nonprod-customized.yaml` file where the secret for  "eventstore" client is properly set to the value configured in the step before:
    ```powershell
    yq -i '.global.commonHorizon.iris.clientSecret = \"default=N25V3loiXgc8USBmoX0AVXmnb3gIs0N6\"' .\pubsub-horizon\examples\horizon-nonprod.yaml
    ```

2. Install Horizon
    ```powershell
    helm upgrade -i -n platform -f .\horizon-nonprod.yaml horizon .\pubsub-horizon-helm-charts\horizon-all
    ```