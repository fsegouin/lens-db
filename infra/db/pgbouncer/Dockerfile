# Transaction pooler on 6543, the counterpart of Supabase's pooler port. Built
# on the same postgres image as the server so both containers share the
# postgres uid and the same certs/ mount works for each.
FROM postgres:17.6

RUN apt-get update \
  && apt-get install -y --no-install-recommends pgbouncer ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/pgbouncer-entrypoint.sh
RUN chmod 0755 /usr/local/bin/pgbouncer-entrypoint.sh

EXPOSE 6543
ENTRYPOINT ["pgbouncer-entrypoint.sh"]
