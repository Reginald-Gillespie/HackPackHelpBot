# /bin/sh

# Wait for network connection - in the case of a power outtage the router might still be down for a minute
until ping -c 1 1.1.1.1 &> /dev/null
do
    echo "Waiting for wifi..."
    sleep 0.5
done
echo "wifi is up"

# Wait for DNS to connect
until ping -c 1 discord.com &> /dev/null
do
    echo "Waiting for DNS..."
    sleep 0.5
done
echo "DNS is up"


while true; do
  # git pull # don't git pull atm, since we might have updated from pi
  # Attempt to run bot. Send all errors to a discord logger
  node src/index.js

  # Sleep to avoid spamming during a bootloop
  sleep 1
done
