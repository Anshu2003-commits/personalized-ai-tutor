FROM nginx:alpine

# Install tools needed for the entrypoint script (including git for branch detection)
RUN apk add --no-cache bash openssl certbot git curl

# Copy the configuration template and the entrypoint script
COPY ./app.conf.template /etc/nginx/templates/default.conf.template
COPY ./entrypoint.sh /docker-entrypoint.sh

# Make the script executable
RUN chmod +x /docker-entrypoint.sh

# The script will be run when the container starts
ENTRYPOINT ["/docker-entrypoint.sh"]
