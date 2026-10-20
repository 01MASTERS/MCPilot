export interface StoreTemplateParams {
  slug: string;
  name: string;
  namespace: string;
  ingressHost: string;
  mariadbRootPassword: string;
  mariadbPassword: string;
  wpAdminPassword: string;
  wcConsumerKey: string;
  wcConsumerSecret: string;
  storageClass?: string;
  mcpServerImage?: string;
}

export function generateStoreManifests(params: StoreTemplateParams) {
  const {
    slug,
    name,
    namespace,
    ingressHost,
    mariadbRootPassword,
    mariadbPassword,
    wpAdminPassword,
    wcConsumerKey,
    wcConsumerSecret,
    storageClass = "local-path",
    mcpServerImage = "mcpilot-woocommerce-mcp:latest",
  } = params;

  // 1. Dedicated Namespace (BONUS-02)
  const namespaceManifest = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/instance": slug,
        "app.kubernetes.io/part-of": "mcpilot-multi-store",
        "mcpilot.io/store-slug": slug,
      },
    },
  };

  // 2. ResourceQuota per store namespace (BONUS-06)
  const resourceQuotaManifest = {
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: {
      name: "store-quota",
      namespace: namespace,
    },
    spec: {
      hard: {
        pods: "6",
        "requests.cpu": "1",
        "requests.memory": "2Gi",
        "limits.cpu": "3",
        "limits.memory": "4Gi",
      },
    },
  };

  // 3. LimitRange per store namespace (BONUS-06)
  const limitRangeManifest = {
    apiVersion: "v1",
    kind: "LimitRange",
    metadata: {
      name: "store-limits",
      namespace: namespace,
    },
    spec: {
      limits: [
        {
          type: "Container",
          default: {
            cpu: "500m",
            memory: "512Mi",
          },
          defaultRequest: {
            cpu: "100m",
            memory: "128Mi",
          },
        },
      ],
    },
  };

  // 4. Strict NetworkPolicy (BONUS-05)
  // Denies cross-store network traffic; only allows Traefik ingress, Gateway MCP proxying, and intra-namespace
  const networkPolicyManifest = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "store-isolation-policy",
      namespace: namespace,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress", "Egress"],
      ingress: [
        // Allow incoming HTTP traffic from Traefik ingress controller (kube-system)
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "kube-system",
                },
              },
            },
          ],
          ports: [{ protocol: "TCP", port: 80 }],
        },
        // Allow incoming MCP proxy calls to WooCommerce MCP server from Gateway pod in default namespace
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "default",
                },
              },
              podSelector: {
                matchLabels: {
                  "app.kubernetes.io/component": "gateway",
                },
              },
            },
          ],
          ports: [{ protocol: "TCP", port: 3000 }],
        },
        // Allow intra-namespace communication (WordPress <-> MariaDB <-> MCP server)
        {
          from: [{ podSelector: {} }],
        },
      ],
      egress: [
        // Allow cluster DNS resolution
        {
          to: [{ namespaceSelector: {} }],
          ports: [
            { protocol: "UDP", port: 53 },
            { protocol: "TCP", port: 53 },
          ],
        },
        // Allow intra-namespace traffic only (WordPress <-> MariaDB)
        {
          to: [{ podSelector: {} }],
        },
      ],
    },
  };

  // 5. Store Secrets (INFRA-06, BONUS-02)
  const secretsManifest = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: "mcpilot-store-secrets",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "secrets",
      },
    },
    type: "Opaque",
    stringData: {
      "mariadb-root-password": mariadbRootPassword,
      "mariadb-password": mariadbPassword,
      "wp-admin-password": wpAdminPassword,
      "wc-consumer-key": wcConsumerKey,
      "wc-consumer-secret": wcConsumerSecret,
    },
  };

  // 6. MariaDB Service & StatefulSet (STORE-01, BONUS-02)
  const mariadbService = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: "mcpilot-mariadb",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "mariadb",
      },
    },
    spec: {
      type: "ClusterIP",
      ports: [{ port: 3306, targetPort: 3306, name: "mysql" }],
      selector: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "mariadb",
      },
    },
  };

  const mariadbStatefulSet = {
    apiVersion: "apps/v1",
    kind: "StatefulSet",
    metadata: {
      name: "mcpilot-mariadb",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "mariadb",
      },
    },
    spec: {
      serviceName: "mcpilot-mariadb",
      replicas: 1,
      selector: {
        matchLabels: {
          "app.kubernetes.io/name": "mcpilot-store",
          "app.kubernetes.io/component": "mariadb",
        },
      },
      template: {
        metadata: {
          labels: {
            "app.kubernetes.io/name": "mcpilot-store",
            "app.kubernetes.io/component": "mariadb",
          },
        },
        spec: {
          containers: [
            {
              name: "mariadb",
              image: "mariadb:10.11",
              imagePullPolicy: "IfNotPresent",
              env: [
                {
                  name: "MARIADB_ROOT_PASSWORD",
                  valueFrom: {
                    secretKeyRef: {
                      name: "mcpilot-store-secrets",
                      key: "mariadb-root-password",
                    },
                  },
                },
                {
                  name: "MARIADB_PASSWORD",
                  valueFrom: {
                    secretKeyRef: {
                      name: "mcpilot-store-secrets",
                      key: "mariadb-password",
                    },
                  },
                },
                { name: "MARIADB_USER", value: "wordpress" },
                { name: "MARIADB_DATABASE", value: "wordpress" },
              ],
              ports: [{ name: "mysql", containerPort: 3306 }],
              volumeMounts: [{ name: "data", mountPath: "/var/lib/mysql" }],
              livenessProbe: {
                exec: { command: ["mariadb-admin", "ping", "-p" + mariadbRootPassword] },
                initialDelaySeconds: 15,
                periodSeconds: 10,
              },
              readinessProbe: {
                exec: { command: ["mariadb-admin", "ping", "-p" + mariadbRootPassword] },
                initialDelaySeconds: 10,
                periodSeconds: 5,
              },
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: "data" },
          spec: {
            accessModes: ["ReadWriteOnce"],
            storageClassName: storageClass,
            resources: { requests: { storage: "1Gi" } },
          },
        },
      ],
    },
  };

  // 7. WordPress PVC, Service & Deployment
  const wordpressPvc = {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: "mcpilot-wordpress-data",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "wordpress",
      },
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      storageClassName: storageClass,
      resources: { requests: { storage: "2Gi" } },
    },
  };

  const wordpressService = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: "mcpilot-wordpress",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "wordpress",
      },
    },
    spec: {
      type: "ClusterIP",
      ports: [{ port: 80, targetPort: 80, name: "http" }],
      selector: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "wordpress",
      },
    },
  };

  const wordpressDeployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: "mcpilot-wordpress",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "wordpress",
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          "app.kubernetes.io/name": "mcpilot-store",
          "app.kubernetes.io/component": "wordpress",
        },
      },
      template: {
        metadata: {
          labels: {
            "app.kubernetes.io/name": "mcpilot-store",
            "app.kubernetes.io/component": "wordpress",
          },
        },
        spec: {
          containers: [
            {
              name: "wordpress",
              image: "wordpress:6.7.1-apache",
              imagePullPolicy: "IfNotPresent",
              env: [
                { name: "WORDPRESS_DB_HOST", value: "mcpilot-mariadb:3306" },
                { name: "WORDPRESS_DB_USER", value: "wordpress" },
                {
                  name: "WORDPRESS_DB_PASSWORD",
                  valueFrom: {
                    secretKeyRef: {
                      name: "mcpilot-store-secrets",
                      key: "mariadb-password",
                    },
                  },
                },
                { name: "WORDPRESS_DB_NAME", value: "wordpress" },
                {
                  name: "WORDPRESS_CONFIG_EXTRA",
                  value: `define('FS_METHOD', 'direct'); define('WP_HOME', 'http://${ingressHost}:8080'); define('WP_SITEURL', 'http://${ingressHost}:8080');`,
                },
              ],
              ports: [{ name: "http", containerPort: 80 }],
              volumeMounts: [{ name: "wordpress-data", mountPath: "/var/www/html" }],
              readinessProbe: {
                httpGet: { path: "/wp-login.php", port: "http" },
                initialDelaySeconds: 15,
                periodSeconds: 5,
              },
            },
          ],
          volumes: [
            {
              name: "wordpress-data",
              persistentVolumeClaim: { claimName: "mcpilot-wordpress-data" },
            },
          ],
        },
      },
    },
  };

  // 8. Ingress Rule (INFRA-04, BONUS-02)
  const ingressManifest = {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: "mcpilot-store-ingress",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "ingress",
      },
    },
    spec: {
      ingressClassName: "traefik",
      rules: [
        {
          host: ingressHost,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: "mcpilot-wordpress",
                    port: { number: 80 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  // 9. Dedicated WooCommerce MCP Server Deployment & Service (BONUS-03)
  const mcpService = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: "mcpilot-woocommerce-mcp",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "woocommerce-mcp",
      },
    },
    spec: {
      type: "ClusterIP",
      ports: [{ port: 3000, targetPort: 3000, name: "http" }],
      selector: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "woocommerce-mcp",
      },
    },
  };

  const mcpDeployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: "mcpilot-woocommerce-mcp",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": "mcpilot-store",
        "app.kubernetes.io/component": "woocommerce-mcp",
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          "app.kubernetes.io/name": "mcpilot-store",
          "app.kubernetes.io/component": "woocommerce-mcp",
        },
      },
      template: {
        metadata: {
          labels: {
            "app.kubernetes.io/name": "mcpilot-store",
            "app.kubernetes.io/component": "woocommerce-mcp",
          },
        },
        spec: {
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1000,
            fsGroup: 1000,
          },
          containers: [
            {
              name: "woocommerce-mcp",
              image: mcpServerImage,
              imagePullPolicy: "IfNotPresent",
              env: [
                { name: "PORT", value: "3000" },
                { name: "WORDPRESS_URL", value: `http://mcpilot-wordpress.${namespace}.svc.cluster.local:80` },
                {
                  name: "WC_CONSUMER_KEY",
                  valueFrom: {
                    secretKeyRef: {
                      name: "mcpilot-store-secrets",
                      key: "wc-consumer-key",
                    },
                  },
                },
                {
                  name: "WC_CONSUMER_SECRET",
                  valueFrom: {
                    secretKeyRef: {
                      name: "mcpilot-store-secrets",
                      key: "wc-consumer-secret",
                    },
                  },
                },
              ],
              ports: [{ name: "http", containerPort: 3000 }],
              livenessProbe: {
                httpGet: { path: "/healthz", port: "http" },
                initialDelaySeconds: 5,
                periodSeconds: 10,
              },
              readinessProbe: {
                httpGet: { path: "/healthz", port: "http" },
                initialDelaySeconds: 3,
                periodSeconds: 5,
              },
            },
          ],
        },
      },
    },
  };

  return {
    namespace: namespaceManifest,
    resourceQuota: resourceQuotaManifest,
    limitRange: limitRangeManifest,
    networkPolicy: networkPolicyManifest,
    secret: secretsManifest,
    mariadbService,
    mariadbStatefulSet,
    wordpressPvc,
    wordpressService,
    wordpressDeployment,
    ingress: ingressManifest,
    mcpService,
    mcpDeployment,
  };
}
