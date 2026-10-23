FROM wordpress:cli-2.11-php8.2

USER root
RUN mkdir -p /opt/plugins
COPY woocommerce.tar.gz /tmp/woocommerce.tar.gz
RUN tar -xzf /tmp/woocommerce.tar.gz -C /opt/plugins/ && rm /tmp/woocommerce.tar.gz

COPY bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

ENTRYPOINT ["/usr/local/bin/bootstrap.sh"]
