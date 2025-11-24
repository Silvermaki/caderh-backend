# CADERH Backend

Backend for the CADERH institutional platform

To start the development server
```bash
npm install
npm run start
```

To connect to the test server instance using SSH
```bash
chmod 400 ./CADERH-KEY.pem
ssh -i "CADERH-KEY.pem" ec2-user@ec2-54-172-140-127.compute-1.amazonaws.com
```

To create a new database migration (replace migration_name with a relevant name for the migration)
```bash
npm run migrate create migration_name
```