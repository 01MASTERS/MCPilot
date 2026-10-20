# Local Domain & Ingress Access Guide

## Overview
The MCPilot cluster routes incoming HTTP traffic through the embedded Traefik Ingress controller bound to localhost on ports **8080** (HTTP) and **8443** (HTTPS).

## Domain Mapping
To access the storefront and services via domain names in your browser:
Add the following lines to your operating system's `hosts` file (`C:\Windows\System32\drivers\etc\hosts` on Windows):

```text
127.0.0.1 store.local.test
127.0.0.1 gateway.local.test
127.0.0.1 mcpilot.local.test
```

### Accessing via Browser & MCP Clients
Because port 8080 is mapped to the cluster load balancer, you can access:
- **Storefront**: `http://store.local.test:8080/`
- **WordPress Admin**: `http://store.local.test:8080/wp-admin/`
- **Team MCP Gateway Health**: `http://gateway.local.test:8080/healthz`
- **Team MCP Gateway Streamable HTTP Endpoint**: `http://gateway.local.test:8080/mcp`

### Direct cURL / CLI Testing (Without Modifying Hosts)
You can test Ingress routing directly without modifying your system `hosts` file by supplying the `Host` header or using `--resolve`:

```bash
# Storefront check
curl -H "Host: store.local.test" http://127.0.0.1:8080/

# Gateway health check
curl -H "Host: gateway.local.test" http://127.0.0.1:8080/healthz

# Gateway tools/list check
curl -X POST -H "Host: gateway.local.test" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' http://127.0.0.1:8080/mcp
```

> **Note on Windows Port 8080 conflicts**: If another application on your system (e.g., Steam CEF) is bound specifically to `127.0.0.1:8080`, target your local machine IP (e.g. `curl --resolve gateway.local.test:8080:<LOCAL_IP> http://gateway.local.test:8080/healthz`) to route directly to Docker/k3d.

