#!/bin/sh
curl -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" -d '{"entity_id": "light.shellycolorbulb_485519fc0343"}' "$HA_URL/api/services/light/turn_on"
