#!/bin/sh
set -eu

# This namespace contains only this job. The browser joins without NET_ADMIN.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT DROP
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -o lo -d 127.0.0.1/32 -j ACCEPT
iptables -A OUTPUT -d "$BROKER_IP" -p tcp --dport "$BROKER_PORT" -j ACCEPT
# gVisor sends raw frames through AF_PACKET, bypassing IP OUTPUT hooks.
# Device egress filtering also covers those frames; unsupported kernels fail closed.
nft -f - <<EOF
table netdev unsubscribe {
  chain egress {
    type filter hook egress device "eth0" priority 0; policy drop;
    ether type arp accept
    ether type ip ip daddr $BROKER_IP tcp dport $BROKER_PORT accept
  }
}
EOF
touch /tmp/ready
sleep 180
