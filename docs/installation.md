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

#### Gateway 
Even though a gateway is not absolutely necessary, we recommend the use of a gateway. Horizon itself was designed with the idea of being addressed via a gateway. For more information, please visit the documentation if the [Open Telekom Integration Platform](https://github.com/telekom/Open-Telekom-Integration-Platform), which includes a gateway.

## 1. Preparations

### 1.1. Installing Kafka

*Note: Horizon relies only on connectivity to Kafka, but it is not necessary to install a dedicated instance for Horizon if an existing Kafka Broker can be used. If you like to use an existing instance instead which might be provided as managed service, you can skip the installation of Kafka.  
However, it's important that Horizon is able to administrate new topics.*

*// work in progress*

### 1.2. Installing MongoDB

 *Note: Similar to the installation step of Kafka, the installation of a dedicated MongoDB instance can be skipped if an existing MongoDB instance can be used, which might be provided as managed service.  
 However, it's important that Horizon is able to administrate new collections.*

*// work in progress*

#### 1.2.1 MongoDB configuration

*// work in progress*

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

Follow the instructions in the respective repositories of the products you want to deploy. The image repositories end with -image. Make sure to make the images available to your Kubernetes cluster.

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

You will find two different configurations in this repository. The first configuration ([docs/examples/values/horizon-nonprod.yaml](https://github.com/telekom/pubsub-horizon/blob/main/docs/examples/values/horizon-nonprod.yaml)) for the installation of Horizon (all components) with minimal scaling intended for non-production environments and for trying out Horizon for the first time. The other configuration ([docs/examples/values/horizon-prod.yaml](https://github.com/telekom/pubsub-horizon/blob/main/docs/examples/values/horizon-nonprod.yaml)) is a suggestion for a possible installation in productive environments. Both configurations differ mainly in the scaling of the individual components and the resources used.  

In this installation guide, we will focus on installing a Horizon instance with minimal scaling so that you can try out Horizon quickly and without any special hardware requirements.  

Before installing Horizon you will need to adjust the default values to your needs depending on the target environment/cluster.
The following fields in particular should be changed for an error-free installation:

- `globals.common.domain`
- `globals.commonHorizon.issuerUrl`
- `globals.image.repository`
- `globals.image.organization`

Note, that `globals.image.organization` refers to the base path of the docker image registry URL, while `globals.image.repository` refers to the registry's hostname. The field `globals.common.domain` is being used for any ingresses that can be installed (horizon-starlight, horizon-pulsar, etc.). You can keep a dummy value here if no Ingresses are planned to be installed (default).

```
helm install -f horizon-nonprod.yaml horizon ./horizon-all -n horizon
```

## 4. Test

*// work in progress*