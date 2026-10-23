#!/bin/sh
set -e

echo "[store-init] Waiting for MariaDB connection on ${WORDPRESS_DB_HOST}..."
until php -r 'mysqli_report(MYSQLI_REPORT_OFF); exit(mysqli_connect(getenv("WORDPRESS_DB_HOST"), getenv("WORDPRESS_DB_USER"), getenv("WORDPRESS_DB_PASSWORD"), getenv("WORDPRESS_DB_NAME")) ? 0 : 1);'; do
  echo "[store-init] MariaDB not ready yet. Retrying in 2 seconds..."
  sleep 2
done
echo "[store-init] MariaDB connection established."

cd /var/www/html

# 1. wp-config.php if missing
if [ ! -f /var/www/html/wp-config.php ]; then
  echo "[store-init] Generating wp-config.php..."
  wp config create \
    --path=/var/www/html \
    --dbhost="${WORDPRESS_DB_HOST}" \
    --dbuser="${WORDPRESS_DB_USER}" \
    --dbpass="${WORDPRESS_DB_PASSWORD}" \
    --dbname="${WORDPRESS_DB_NAME}" \
    --skip-check \
    --force \
    --allow-root
fi

# 2. WordPress core install
if ! wp core is-installed --path=/var/www/html --allow-root 2>/dev/null; then
  echo "[store-init] Installing WordPress core for ${STORE_NAME} (${WP_URL})..."
  wp core install \
    --path=/var/www/html \
    --url="${WP_URL}" \
    --title="${STORE_NAME:-WooCommerce Store}" \
    --admin_user="admin" \
    --admin_password="${WP_ADMIN_PASSWORD}" \
    --admin_email="admin@local.test" \
    --skip-email \
    --allow-root
else
  echo "[store-init] WordPress core is already installed."
fi

# 3. Ensure plugins directory exists and copy pre-packaged WooCommerce
mkdir -p /var/www/html/wp-content/plugins /var/www/html/wp-content/uploads /var/www/html/wp-content/upgrade
if [ ! -d /var/www/html/wp-content/plugins/woocommerce ]; then
  echo "[store-init] Copying bundled WooCommerce plugin..."
  cp -r /opt/plugins/woocommerce /var/www/html/wp-content/plugins/
fi

# 4. Activate WooCommerce
echo "[store-init] Activating WooCommerce plugin..."
wp plugin activate woocommerce --path=/var/www/html --allow-root || true

# 5. Flush rewrite rules
wp rewrite structure '/%postname%/' --hard --path=/var/www/html --allow-root || true

# 6. Enable Cash on Delivery
wp option update woocommerce_cod_settings '{"enabled":"yes","title":"Cash on delivery","description":"Pay with cash upon delivery.","instructions":"Pay with cash upon delivery.","enable_for_methods":[],"enable_for_virtual":"yes"}' --format=json --path=/var/www/html --allow-root || true

# 7. Seed demo products if none exist
if [ "$(wp post list --post_type=product --format=count --path=/var/www/html --allow-root 2>/dev/null || echo 0)" -eq 0 ]; then
  echo "[store-init] Creating initial demo products for ${STORE_NAME}..."
  wp wc product create \
    --name="${STORE_NAME:-Demo} Flagship Item" \
    --type="simple" \
    --regular_price="49.99" \
    --description="Exclusive demo product for ${STORE_NAME:-Store}" \
    --user=1 \
    --path=/var/www/html \
    --allow-root || true

  wp wc product create \
    --name="${STORE_NAME:-Demo} Premium Package" \
    --type="simple" \
    --regular_price="89.99" \
    --description="Premium product bundle for ${STORE_NAME:-Store}" \
    --user=1 \
    --path=/var/www/html \
    --allow-root || true
fi

# 8. Insert WooCommerce API key for MCP server
echo "[store-init] Ensuring WooCommerce REST API keys for MCP server..."
php -r "require '/var/www/html/wp-load.php'; global \$wpdb; \$k = getenv('WC_CONSUMER_KEY'); \$s = getenv('WC_CONSUMER_SECRET'); \$exists = \$wpdb->get_var(\$wpdb->prepare(\"SELECT key_id FROM {\$wpdb->prefix}woocommerce_api_keys WHERE truncated_key = %s\", substr(\$k, -7))); if (!\$exists) { \$wpdb->insert(\$wpdb->prefix . 'woocommerce_api_keys', ['user_id' => 1, 'description' => 'MCPilot Provisioned Key', 'permissions' => 'read_write', 'consumer_key' => wc_api_hash(\$k), 'consumer_secret' => \$s, 'truncated_key' => substr(\$k, -7)]); echo 'Created MCPilot WooCommerce API Key' . PHP_EOL; } else { echo 'API Key already exists' . PHP_EOL; }"

chmod -R 777 /var/www/html/wp-content
chown -R 33:33 /var/www/html/wp-content
echo "[store-init] Bootstrap complete for ${STORE_NAME}!"
