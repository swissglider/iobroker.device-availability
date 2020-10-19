#!/bin/bash

npm run build

# ssh root@192.168.90.1 rm -rf /opt/iobroker/node_modules/iobroker.device-availability/www
# scp -r www root@192.168.90.1:/opt/iobroker/node_modules/iobroker.device-availability/

# ssh root@192.168.90.1 rm -rf /opt/iobroker/node_modules/iobroker.device-availability/admin
# scp -r admin root@192.168.90.1:/opt/iobroker/node_modules/iobroker.device-availability/
# scp -r io-package.json root@192.168.90.1:/opt/iobroker/node_modules/iobroker.device-availability/

scp -r build root@192.168.90.1:/opt/iobroker/node_modules/iobroker.device-availability/

ssh root@192.168.90.1 iobroker upload device-availability