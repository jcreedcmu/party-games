#!/usr/bin/bash

/usr/bin/bwrap \
    --tmpfs /tmp \
    --dev /dev \
    --proc /proc \
    --hostname poop-deli --unshare-uts \
    --ro-bind /bin /bin \
    --ro-bind /lib /lib \
    --ro-bind /lib32 /lib32 \
    --ro-bind /lib64 /lib64 \
    --ro-bind /usr/bin /usr/bin \
    --ro-bind /usr/lib /usr/lib \
    --ro-bind /usr/local/bin /usr/local/bin \
    --ro-bind /usr/local/lib /usr/local/lib \
    --ro-bind /etc/alternatives /etc/alternatives \
    --ro-bind /etc/resolv.conf /etc/resolv.conf \
    --ro-bind /etc/ssl/certs /etc/ssl/certs \
    --ro-bind /etc/ld.so.cache /etc/ld.so.cache \
    --ro-bind /etc/ld.so.conf /etc/ld.so.conf \
    --ro-bind /etc/ld.so.conf.d /etc/ld.so.conf.d \
    --ro-bind /etc/localtime /etc/localtime \
    --ro-bind /usr/share/ca-certificates /usr/share/ca-certificates \
    --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf \
    --ro-bind /etc/hosts /etc/hosts \
    --ro-bind /etc/ssl/openssl.cnf /etc/ssl/openssl.cnf \
    --ro-bind /usr/share/zoneinfo /usr/share/zoneinfo \
    --ro-bind $HOME/.nvm $HOME/.nvm \
    --ro-bind "$PWD" "$PWD" \
    --bind "$PWD/server/games/pictionary/word-list.json" "$PWD/server/games/pictionary/word-list.json" \
    npx tsx server/index.ts "$@"
