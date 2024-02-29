# Installing Horizon

## Prerequisites

### Kubernetes

Horizon is a cloud-native application that must be installed in a Kubernetes cluster.
Operating Horizon also requires the installation of custom resource definitions (CRDs), which can only be done with cluster admin permissions.

### Other dependencies

- Kafka: Horizon in its current form has been built around Kafka and therefore requires Kafka to be installed in the target cluster in order to run.
- MongoDB: Horizon requires a running MongoDB instance for many operations, which is used to store metadata and track the status of events.

## 1. Preparations

### 1.1. Installing Kafka

*Note: Horizon relies only on connectivity to Kafka, but it is not necessary to install a dedicated instance for Horizon if an existing Kafka Broker can be used. If you like to use an existing instance instead which might be provided as managed service, you can skip the installation of Kafka.  
However, it's important that Horizon is able to administrate new topics.*

### 1.2. Installing MongoDB

 *Note: Similar to the installation step of Kafka, the installation of a dedicated MongoDB instance can be skipped if an existing MongoDB instance can be used, which might be provided as managed service.  
 However, it's important that Horizon is able to administrate new collections.*

#### 1.2.1 MongoDB configuration


### 1.3. Installing CRDs

While Horizon components are usually installed by using Helm charts, the installation of the required CRDs is not managed through Helm currently.  
Assuming the necessary rights exist in the cluster, the CRD describing a Horizon Subscribtion can be easily installed via `kubectl` command:

```
kubectl apply -f resources/crds.yaml
```

#### Metrics

By default, Horizon components will integrate with Prometheus through the use of a ServiceMonitor custom resource. Please refer to the instructions in the documentation of the [Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator) to install the Prometheus operator and its CRDs.  
Alternatively, you can disable the installation of a ServiceMonitor for each component by setting `.Values.monitoring.serviceMonitor.enabled` to false.

### 1.4. Installing headless services

First create a new Kubernetes namespace that will be used to install all horizon related resources:

```
kubectl create namespace horizon
```

Some components (Galaxy, Comet, Polaris) depend on the existence of special headless Kubernetes services that will be used for the discovery of distributed cache instances used by Horizon. These services also need to be installed in the horizon namespace:

```
kubectl apply -f resources/services.yaml -n horizon
```

## 2. Installing Horizon

For a minimal setup of Horizon it is not necessary to install all components of Horizon. However, we recommend a complete installation with all components so that all Horizon features can be used.  
For example, a minimal setup would consists of Starlight, Galaxy, Comet.  
But with such a minimal setup, you would lose the tracking of status information, the ability to transmit events via SSE and the important circuit-breaker handling functionality that adds fundamental resilience to Horizon.

The installation of Horizon is done by applying Helm charts. If you need help with Helm, please refer to Helm's [usage guide](https://helm.sh/docs/intro/using_helm/) first.
Alternatively, the Helm Charts can also be installed using other Helm compatible continuous deployment solutions such as Argo CD. We also use Argo CD internally to install and update our Horizon instances and  can recommend it for productive use.  
However, for the sake of simplicity, we will limit ourselves to the use of Helm commands in the following installation instructions.

### 2.1. Preparation steps

First of all, clone Horizon's [Helm Chart repository](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main) and change to the repository's directory. It will contain necessary Helm charts for installing Horizon.  

All Horizon Helm charts refer to a docker image for the respective component. Make sure that new deployments in the cluster have the rights to pull the docker images, which is not the case with many private registries. Please refer to the [Kubernetes documentation](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/#registry-secret-existing-credentials) if you need help with installing pull secrets.  
In the following we assume, you already installed a pull secret `open-telekom-integration-platform-pull-secret` that makes it possible to pull from the registry where all necessary Horizon docker images are located.

### 2.1. Installing Horizon Starlight

Before installing Horizon Starlight you need to adjust the values to your needs depending on the target environment/cluster. See the following example:

<details>
  <summary>Starlight values example</summary>
  <br />

Copy the followig to a new file `starlight-values.yaml` and adjust the values according to your needs:

```yaml
image:
  tag: 4.0.0

replicas: 4

starlight:
  features:
    schemaValidation: false

resources:
  limits:
    cpu: 1
    memory: 1Gi
  requests:
    cpu: 0.5
    memory: 200Mi

```

Note: `starlight.features.schemaValidation` is set to `false`, since this feature is currently not part of the open source release.  

For a complete list of possible values have a look at the documentation and default `values.yaml` of the [Horizon Starlight Helm Chart](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main/horizon-starlight).

</details>
<br />

```
helm install -f common-values.yaml -f starlight-values.yaml horizon-starlight ./horizon-starlight -n horizon
```

### 2.2. Installing Horizon Galaxy

Before installing Horizon Galaxy you need to adjust the values to your needs depending on the target environment/cluster. See the following example:

<details>
  <summary>Galaxy values example</summary>
  <br />

Copy the followig to a new file `galaxy-values.yaml` and adjust the values according to your needs:

```yaml
image:
  tag: 4.0.0

replicas: 8

galaxy:
  kafka:
    consumingPartitionCount: 4

  cache:
    serviceDns: horizon-galaxy-cache-discovery-headless.horizon.svc.cluster.local

resources:
  limits:
    cpu: 1
    memory: 1.5Gi
  requests:
    cpu: 0.5
    memory: 200Mi
```

For a complete list of possible values have a look at the documentation and default `values.yaml` of the [Horizon Galaxy Helm Chart](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main/horizon-galaxy).

</details>
<br />

```
helm install -f common-values.yaml -f galaxy-values.yaml horizon-galaxy ./horizon-galaxy -n horizon
```

### 2.3. Installing Horizon Comet

Before installing Horizon Comet you need to adjust the values to your needs depending on the target environment/cluster. See the following example:

<details>
  <summary>Comet values example</summary>
  <br />

Copy the followig to a new file `comet-values.yaml` and adjust the values according to your needs:

```yaml
image:
  tag: 4.0.0

replicas: 8

comet:
  iris:
    tokenEndpoint: https://keycloak.example.domain.com/auth/realms/<realm>/protocol/openid-connect/token
    clientId: eventstore
    clientSecret: changeme
  
  cache:
    serviceDNS: horizon-callback-cache-discovery-headless.horizon.svc.cluster.local

  callback:
    redeliveryThreadpoolSize: 100

  kafka:
    consumingPartitionCount: 4
    consumerThreadpoolSize: 512
    consumerQueueCapacity: 1024
    maxPollRecords: 512

resources:
  limits:
    cpu: 2
    memory: 2Gi
  requests:
    cpu: 0.5
    memory: 200Mi

```

For a complete list of possible values have a look at the documentation and default `values.yaml` of the [Horizon Comet Helm Chart](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main/horizon-comet).

</details>
<br />


```
helm install -f common-values.yaml -f comet-values.yaml horizon-comet ./horizon-comet -n horizon
```

### 2.4. Installing Horizon Polaris

Before installing Horizon Polaris you need to adjust the values to your needs depending on the target environment/cluster. See the following example:

<details>
  <summary>Polaris values example</summary>
  <br />

Copy the followig to a new file `polaris-values.yaml` and adjust the values according to your needs:

```yaml
image:
  tag: 4.0.0

replicas: 4

polaris:
  iris:
    tokenEndpoint: https://keycloak.example.domain.com/auth/realms/<realm>/protocol/openid-connect/token
    clientId: eventstore
    clientSecret: changeme
  
  cache:
    serviceDNS: horizon-callback-cache-discovery-headless.horizon.svc.cluster.local

  mongo:
    url: mongodb://user:pass@horizon-mongodb-sharded.horizon.svc.cluster.local:27017

  polling:
    batchSize: 100
    
resources:
  limits:
    cpu: 1
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 200Mi

```

For a complete list of possible values have a look at the documentation and default `values.yaml` of the [Horizon Polaris Helm Chart](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main/horizon-polaris).

</details>
<br />


```
helm install -f common-values.yaml -f polaris-values.yaml horizon-polaris ./horizon-polaris -n horizon
```

### 2.5. Installing Horizon Vortex

Before installing Horizon Vortex you need to adjust the values to your needs depending on the target environment/cluster. See the following example:

<details>
  <summary>Vortex values example</summary>
  <br />

Copy the followig to a new file `vortex-values.yaml` and adjust the values according to your needs:

```yaml
image:
  tag: 4.0.0

replicas: 8

kafka:
  broker: horizon-kafka.horizon:9092

mongo:
  url: mongodb://user:pass@horizon-mongodb-sharded.horizon.svc.cluster.local:27017
  flushIntervalSec: 5

resources:
  limits:
    cpu: 1.5
    memory: 2Gi
  requests:
    cpu: 50m
    memory: 200Mi

```

For a complete list of possible values have a look at the documentation and default `values.yaml` of the [Horizon Vortex Helm Chart](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main/horizon-vortex).

</details>
<br />



```
helm install -f common-values.yaml -f vortex-values.yaml horizon-vortex ./horizon-vortex -n horizon
```

### 2.6. Installing Horizon Pulsar

*Note: Pulsar is highly dependant on Horizon Vortex. Make sure Vorttex is installed when operating Pulsar.*  

Before installing Horizon Pulsar you need to adjust the values to your needs depending on the target environment/cluster. See the following example:

<details>
  <summary>Pulsar values example</summary>
  <br />

Copy the followig to a new file `pulsar-values.yaml` and adjust the values according to your needs:

```yaml
image:
  tag: 4.0.0

replicas: 4

pulsar:
  mongo:
    url: mongodb://user:pass@horizon-mongodb-sharded.horizon.svc.cluster.local:27017

resources:
  limits:
    cpu: 1
    memory: 2Gi
  requests:
    cpu: 0.5
    memory: 200Mi

```

For a complete list of possible values have a look at the documentation and default `values.yaml` of the [Horizon Pulsar Helm Chart](https://github.com/telekom/pubsub-horizon-helm-charts/tree/main/horizon-pulsar).

</details>
<br />


```
helm install -f common-values.yaml -f pulsar-values.yaml horizon-pulsar ./horizon-pulsar -n horizon
```

## 3. Test