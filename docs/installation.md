# Installing Horizon

## Prerequisites

### Kubernetes

Horizon is a cloud-native application that is designed to be deployed on Kubernetes. Currently, it is tested with Kubernetes version **1.24**.  
Operating Horizon also requires the installation of custom resource definitions (CRDs), which can only be done with cluster admin permissions.

#### Additional required Kubernetes features:

- Kubernetes Ingress Controller (preferably [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/))
- Kubernetes DNS (preferably [CoreDNS](https://coredns.io/))
- Persistent Volumes (NFS or [block storage](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) like gp2)

### Other dependencies

- [Kafka](https://github.com/bitnami/charts/tree/main/bitnami/kafka): Horizon in its current form has been built around Kafka and therefore requires Kafka to be installed in the target cluster in order to run.
- [MongoDB](https://github.com/bitnami/charts/tree/main/bitnami/mongodb): Horizon requires a running MongoDB instance for many operations, which is used to store metadata and track the status of events.
- [Keycloak](https://github.com/telekom/identity-iris-keycloak-charts) or any other identity provider (IDP) implementing OpenID Connect

Note, that Keycloak is often referred to as "Iris" within the Horizon source code or Helm Charts.  

This article will also briefly explain the installation of the dependencies mentioned above.

#### Gateway 

Even though a gateway is not absolutely necessary, we recommend the use of a gateway. Horizon itself was designed with the idea of being addressed via a gateway. For more information, please visit the documentation if the [Open Telekom Integration Platform](https://github.com/telekom/Open-Telekom-Integration-Platform), which includes a gateway.

## 1. Preparations

### 1.1. Installing Kafka

*Note: Horizon relies only on connectivity to Kafka, but it is not necessary to install a dedicated instance for Horizon if an existing Kafka Broker can be used. If you like to use an existing instance instead which might be provided as managed service, you can skip the installation of Kafka.  
However, it's important that Horizon is able to administrate new topics.*  

You can use the following command to install the Kafka Helm chart from Bitnami with basic values, which is sufficient to run Horizon:

```bash
helm install horizon-kafka oci://registry-1.docker.io/bitnamicharts/kafka -f kafka-sample-values.yaml -n horizon --version 26.11.4
```

As example you can use the following `kafka-sample-values.yaml` file to set up Kafka. But these values are not intended to be used in production. For testing purpose we suggest to use changing the default client protocol to `PLAINTEXT` instead of `SASL_PLAINTEXT`.

kafka-sample-values.yaml:
```yaml
listeners:  
  client:    
    containerPort: 9092    
    protocol: PLAINTEXT    
    name: CLIENT    
    sslClientAuth: ""
```

For more details on how to configure Kafka, we recommend checking out [Bitnami's Helm chart documentation](https://github.com/bitnami/charts/tree/main/bitnami/kafka) and the official [Kafka documentation](https://docs.confluent.io/platform/current/installation/configuration/index.html).


### 1.2. Installing MongoDB

 *Note: Similar to the installation step of Kafka, the installation of a dedicated MongoDB instance can be skipped if an existing MongoDB instance can be used, which might be provided as managed service.  
 However, it's important that Horizon is able to administrate new collections.*  

## MongoDB with Sharding

You can use the following command to install the sharded MongoDB Helm chart from Bitnami with basic values, which is sufficient to run Horizon:

```bash
helm install horizon-mongodb oci://registry-1.docker.io/bitnamicharts/mongodb-sharded -n horizon --version 7.8.1
``` 

Note, that this setup is not intended to be used in production without any adjustments on the configuration.  

For more details on how to configure MongoDB, we recommend checking out [Bitnami's Helm chart documentation](https://github.com/bitnami/charts/tree/main/bitnami/mongodb-sharded) and the official [MongoDB documentation](https://www.mongodb.com/docs/manual/).


#### 1.2.1 MongoDB configuration

First, make sure you have [`mongosh`](https://www.mongodb.com/try/download/shell) installed, which is a shell for MongoDB. Alternatively you can also install the [MongoDB Compass GUI](https://www.mongodb.com/try/download/compass) which also comes with a shell but is also super useful for general working with MongoDB.  

Then you should be able to initialize a new Horizon database collection:

init-database.js:  
```js
db.adminCommand({
    shardCollection: "horizon.status",
    key: {"event.id": "hashed"}
})
```

```bash
mongosh -u $MONGODB_ROOT_USER -p $MONGODB_ROOT_PASSWORD "mongodb://$MONGODB_HOST" --file ./init-database.js
```

The following command will create indices on the status collection that are required to maintain the performance when doing any useful queries:


init-indices.js:  
```js
horizon = db.getSiblingDB('horizon')
horizon.runCommand({
  createIndexes: "status",
  indexes: [
    {
      key: {"status": 1},
      name: "status_1"
    },
    {
      key: {"event.type": 1},
      name: "event_type_1"
    },
    {
      key: {"subscriptionId": 1},
      name: "subscriptionId_1"
    },
    {
      key: {"timestamp": 1},
      name: "1w_ttl",
      expireAfterSeconds: 604800
    },
    {
      key: {"properties.multiplexed-from": 1},
      name: "properties_multiplexed-from_1"
    },
    {
      key: {"deliveryType": 1},
      name: "deliveryType_1"
    },
    {
      key: {"environment": 1},
      name: "environment_1"
    },
    {
      key: {"subscriptionId": 1, "status": 1, "timestamp": 1},
      name: "subscriptionId_1_status_1"
    },
    {
      key: {"status": 1, "deliveryType": 1,"subscriptionId": 1, "timestamp": 1},
      name: "sse_sorted_index"
    },
    {
      key: {"error.type": 1, "status": 1, "timestamp": 1},
      name: "cb_error_status"
    },
    {
      key: {"error.type": 1, "status": 1, "subscriptionId": 1, "timestamp": 1},
      name: "cb_error_status_subscriptionId"
    },
    {
      key: {"deliveryType": 1, "status": 1, "timestamp": 1},
      name: "cb_deliveryType_status_timestamp"
    }
  ]
})
```

```
mongosh -u $MONGODB_ROOT_USER -p $MONGODB_ROOT_PASSWORD "mongodb://$MONGODB_HOST" --file ./init-indices.js
```

### 1.3. IDP configuration

Horizon assumes that a client with the name "evenstore" exists in the "default" realm of the IDP. This must first be configured manually in the IDP so that Horizon can issue a valid token when delivering events via callback, among other things.

### 1.4. Installing CRDs

While Horizon components are usually installed by using Helm charts, the installation of the required CRDs is not managed through Helm currently.  
Assuming the necessary rights exist in the cluster, the CRD describing a Horizon Subscribtion can be easily installed via `kubectl` command:

```
kubectl apply -f resources/crds.yaml
```

#### Metrics

By default, Horizon components will integrate with Prometheus through the use of a ServiceMonitor custom resource. Please refer to the instructions in the documentation of the [Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator) to install the Prometheus operator and its CRDs.  
Alternatively, you can disable the installation of a ServiceMonitor for each component by setting `.Values.monitoring.serviceMonitor.enabled` to false.

### 1.5. Installing headless services

First create a new Kubernetes namespace that will be used to install all horizon related resources:

```
kubectl create namespace horizon
```

Some components (Galaxy, Comet, Polaris) depend on the existence of special headless Kubernetes services that will be used for the discovery of distributed cache instances used by Horizon. These services also need to be installed in the horizon namespace:

```
kubectl apply -f resources/services.yaml -n horizon
```

## 2. Preparing the images

To install Horizon, all components to be installed must first be built and dockerized. The corresponding Docker images must be made available in a Docker registry so that they can be pulled during the installation.  

For information on how to build the individual components, please refer to the individual repositories of the Horizon components:

- [Horizon Starlight](https://github.com/telekom/pubsub-horizon-starlight)
- [Horizon Galaxy](https://github.com/telekom/pubsub-horizon-galaxy)
- [Horizon Comet](https://github.com/telekom/pubsub-horizon-comet)
- [Horizon Pulsar](https://github.com/telekom/pubsub-horizon-pulsar)
- [Horizon Polaris](https://github.com/telekom/pubsub-horizon-polaris)
- [Horizon Vortex](https://github.com/telekom/pubsub-horizon-vortex)

## 3. Installing Horizon

For a minimal setup of Horizon it is not necessary to install all components of Horizon. However, we recommend a complete installation with all components so that all Horizon features can be used.  
For example, a minimal setup would consists of Starlight, Galaxy, Comet.  
But with such a minimal setup, you would lose the tracking of status information, the ability to transmit events via SSE and the important circuit-breaker handling functionality that adds fundamental resilience to Horizon.

The installation of Horizon is done by applying Helm charts. If you need help with Helm, please refer to Helm's [usage guide](https://helm.sh/docs/intro/using_helm/) first.
Alternatively, the Helm Charts can also be installed using other Helm compatible continuous deployment solutions such as Argo CD. We also use Argo CD internally to install and update our Horizon instances and  can recommend it for productive use.  
However, for the sake of simplicity, we will limit ourselves to the use of Helm commands in the following installation instructions.

### 3. Installing Horizon

First of all, clone Horizon's [Helm Chart repository](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main) and change to the repository's directory. It will contain necessary Helm charts for installing Horizon.  

#### Pull secrets 

All Horizon Helm charts refer to a docker image for the respective component. Make sure that new deployments in the cluster have the rights to pull the docker images, which is not the case with many private registries. Please refer to the [Kubernetes documentation](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/#registry-secret-existing-credentials) if you need help with installing pull secrets.  
In the following we assume, you already installed a pull secret `open-telekom-integration-platform-pull-secret` that makes it possible to pull from the registry where all necessary Horizon docker images are located.

#### Installation

To simplify things, we added another Helm chart "horizon-all" which can be used to install all Horizon components at once. In the following sections we will use this Helm chart.  

You will find two different configurations in this repository. The first configuration ([examples/horizon-nonprod.yaml](https://github.com/telekom/pubsub-horizon/blob/main/examples/horizon-nonprod.yaml)) for the installation of Horizon (all components) with minimal scaling intended for non-production environments and for trying out Horizon for the first time. The other configuration ([examples/horizon-prod.yaml](https://github.com/telekom/pubsub-horizon/blob/main/examples/horizon-nonprod.yaml)) is a suggestion for a possible installation in productive environments. Both configurations differ mainly in the scaling of the individual components and the resources used.  

In this article, we will focus on installing a Horizon instance with minimal scaling so that you can try out Horizon quickly and without any special hardware requirements.  

Before installing Horizon you will need to adjust the default values to your needs depending on the target environment/cluster.
The following fields in particular usually need to be changed for an error-free installation:

- `global.imagePullSecrets`
- `global.ingress.hosts`
- `global.commonHorizon.issuerUrl`
- `global.commonHorizon.iris.tokenEndpoint`
- `global.commonHorizon.iris.clientSecret`
- `global.commonHorizon.mongo.url`

You can keep the dummy value for the host (`global.ingress.hosts`) if no Ingresses are planned to be installed (default).

Additionally you should set the correct image repository for each sub-product image:

- `<sub-product>.image.repository`

```
helm upgrade -i -n horizon -f horizon-nonprod.yaml horizon ./horizon-all
```

## 4. Test

*// work in progress*