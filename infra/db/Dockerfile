# The Lens DB production Postgres. Config and init scripts are baked in so the
# host only needs docker compose, a .env and the certs/ directory.
FROM postgres:17.6

COPY postgresql.conf /etc/postgresql/postgresql.conf
COPY pg_hba.conf /etc/postgresql/pg_hba.conf
COPY initdb/ /docker-entrypoint-initdb.d/
COPY entrypoint.sh /usr/local/bin/lens-db-entrypoint.sh
RUN chmod 0755 /usr/local/bin/lens-db-entrypoint.sh /docker-entrypoint-initdb.d/*.sh \
  && chmod 0644 /etc/postgresql/postgresql.conf /etc/postgresql/pg_hba.conf

ENTRYPOINT ["lens-db-entrypoint.sh"]
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
