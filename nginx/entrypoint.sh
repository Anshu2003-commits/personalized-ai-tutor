#!/bin/bash
set -e

# --- LOAD ENVIRONMENT CONFIG ---
# CI/CD does not sync .git to the VM, so prefer the explicit Docker env value.
DEPLOY_ENV="${ENVIRONMENT:-}"

if [ -z "$DEPLOY_ENV" ]; then
    CURRENT_BRANCH=$(git --git-dir=/app/.git --work-tree=/app rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    DEPLOY_ENV="$CURRENT_BRANCH"
fi

if [ "$DEPLOY_ENV" = "production" ]; then
    CONFIG_FILE="/app/config/production.env"
    echo "### Loading production config"
elif [ "$DEPLOY_ENV" = "staging" ] || [ "$DEPLOY_ENV" = "main" ]; then
    CONFIG_FILE="/app/config/staging.env"
    echo "### Loading staging config"
elif [ "$DEPLOY_ENV" = "master" ]; then
    CONFIG_FILE="/app/config/master.env"
    echo "### Loading master config"
else
    CONFIG_FILE="/app/config/staging.env"
    echo "### Unknown environment ($DEPLOY_ENV) - defaulting to staging config"
fi

# Load configuration file
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
    echo "### Loaded config from $CONFIG_FILE"
else
    echo "### ERROR: Config file not found: $CONFIG_FILE"
    echo "### Falling back to default staging config"
    NGINX_DOMAINS="dev.onlearn.app"
    NGINX_EMAIL="ashishindian2003@gmail.com"
fi

# Parse comma-separated domains into bash array
IFS=',' read -ra domains <<< "$NGINX_DOMAINS"
email="$NGINX_EMAIL"
# --- END ENVIRONMENT CONFIG ---

# --- Other Settings ---
staging=0 # Set to 1 to use Let's Encrypt's staging server for testing
rsa_key_size=4096
letsencrypt_path="/etc/letsencrypt"
cert_path="$letsencrypt_path/live/${domains[0]}"

# If certificates don't exist, obtain them
if [ ! -d "$cert_path" ]; then
  echo "### Certificates not found. Requesting from Let's Encrypt..."

  # Create a temporary Nginx config for the ACME challenge
  echo "server { listen 80; server_name ${domains[*]}; root /var/www/certbot; }" > /etc/nginx/conf.d/default.conf

  # Start a temporary Nginx
  nginx -g 'daemon on;'

  # Prepare Certbot command
  domain_args=""
  for domain in "${domains[@]}"; do
    domain_args="$domain_args -d $domain"
  done

  staging_arg=""
  if [ "$staging" != "0" ]; then
    staging_arg="--staging"
  fi

  # Request the certificate
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    --email $email \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos --non-interactive \
    --no-eff-email

  # Stop the temporary Nginx
  nginx -s stop
  # Wait for it to shut down
  while pgrep -x nginx > /dev/null; do sleep 1; done

fi

# ====================================================================================
# === NEW SECTION: Create SSL security files if they don't exist =====================
# ====================================================================================

options_ssl_path="$letsencrypt_path/options-ssl-nginx.conf"
ssl_dhparam_path="$letsencrypt_path/ssl-dhparams.pem"

if [ ! -f "$options_ssl_path" ]; then
    echo "### Downloading recommended SSL parameters ..."
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$options_ssl_path"
fi

if [ ! -f "$ssl_dhparam_path" ]; then
    echo "### Generating DH parameters (2048 bit)... This will take a moment."
    openssl dhparam -out "$ssl_dhparam_path" 2048
fi

# ====================================================================================
# === END NEW SECTION ================================================================
# ====================================================================================


# Generate the final Nginx config from the template
export DOMAIN=${domains[0]}
export DOMAINS=$(echo "${domains[*]}" | sed 's/ / /g')
export DOLLAR='$'
envsubst < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "### Starting Nginx..."
exec nginx -g 'daemon off;'
