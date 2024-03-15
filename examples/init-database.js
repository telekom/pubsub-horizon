// Copyright 2024 Deutsche Telekom IT GmbH
//
// SPDX-License-Identifier: Apache-2.0

// initialize new database collection
db.adminCommand({
  shardCollection: "horizon.status",
  key: {"event.id": "hashed"}
})

// create indices
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