# Backend Deployment Guide

This guide covers deploying the Node.js Express backend to various hosting platforms.

## 🚀 Deployment Platforms

### 1. Heroku

#### Prerequisites

- Heroku CLI installed
- Git repository

#### Steps

```bash
# Login to Heroku
heroku login

# Create Heroku app
heroku create your-uploader-backend

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set PORT=3001
heroku config:set AWS_REGION=ap-south-1
heroku config:set AWS_ACCESS_KEY_ID=your_aws_access_key
heroku config:set AWS_SECRET_ACCESS_KEY=your_aws_secret_key
heroku config:set S3_BUCKET_NAME=your-bucket-name
heroku config:set S3_UPLOAD_PATH=uploads/
heroku config:set S3_PRESIGNED_URL_EXPIRES=604800
heroku config:set ALLOWED_ORIGINS=https://your-frontend-domain.com,https://your-frontend-netlify.app
heroku config:set MAX_FILE_SIZE=100000000
heroku config:set ALLOWED_FILE_TYPES=video/mp4,video/avi,video/mov,video/wmv,video/flv,video/webm

# Deploy
git add .
git commit -m "Deploy backend"
git push heroku main
```

### 2. Railway

#### Steps

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables in Railway dashboard
# Or use CLI:
railway variables set NODE_ENV=production
railway variables set AWS_ACCESS_KEY_ID=your_aws_access_key
# ... (set all other variables)
```

### 3. Render

#### Steps

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables in Render dashboard

### 4. DigitalOcean App Platform

#### Steps

1. Connect GitHub repository
2. Configure build settings:
   - Build Command: `npm install`
   - Run Command: `npm start`
3. Set environment variables
4. Deploy

### 5. AWS EC2

#### Steps

```bash
# SSH into EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone your-repo-url
cd uploader-backend

# Install dependencies
npm install

# Create .env file
nano .env
# Add all environment variables

# Install PM2 for process management
sudo npm install -g pm2

# Start application
pm2 start src/server.js --name uploader-backend

# Setup PM2 to start on boot
pm2 startup
pm2 save

# Setup nginx reverse proxy (optional)
sudo apt install nginx
sudo nano /etc/nginx/sites-available/uploader-backend
```

Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔧 Environment Variables

Required environment variables for production:

```env
NODE_ENV=production
PORT=3001
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
S3_BUCKET_NAME=your-bucket-name
S3_UPLOAD_PATH=uploads/
S3_PRESIGNED_URL_EXPIRES=604800
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://another-domain.com
MAX_FILE_SIZE=100000000
ALLOWED_FILE_TYPES=video/mp4,video/avi,video/mov,video/wmv,video/flv,video/webm
```

## 🔒 Security Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS in production
- [ ] Set proper CORS origins (no wildcards in production)
- [ ] Use environment variables for sensitive data
- [ ] Enable rate limiting (consider adding express-rate-limit)
- [ ] Set up proper logging
- [ ] Use a reverse proxy (nginx/Apache)
- [ ] Set up SSL certificates
- [ ] Configure firewall rules
- [ ] Use IAM roles instead of access keys when possible

## 📊 Monitoring

### Health Check Endpoint

Your backend provides a health check at:

- `GET /` - Basic health check
- `GET /api/upload/health` - Detailed health check with S3 status

### Logging

The backend uses Morgan for request logging. In production, logs are in combined format.

### Error Handling

All errors are properly handled and logged. Sensitive information is not exposed in production.

## 🚨 Troubleshooting

### Common Issues

1. **CORS Errors**

   - Ensure frontend domain is in `ALLOWED_ORIGINS`
   - Check that protocol (http/https) matches

2. **AWS Errors**

   - Verify AWS credentials are correct
   - Check S3 bucket permissions
   - Ensure bucket exists and is in correct region

3. **Port Issues**

   - Most platforms override PORT environment variable
   - Ensure your app listens on `process.env.PORT`

4. **Build Failures**
   - Check Node.js version compatibility
   - Ensure all dependencies are in package.json
   - Verify build scripts are correct

## 📝 Post-Deployment

After deployment:

1. Test health check endpoint: `https://your-backend-domain.com/api/upload/health`
2. Test CORS by making a request from your frontend domain
3. Test file upload flow end-to-end
4. Monitor logs for any errors
5. Set up monitoring/alerting if needed

## 🔄 Updates

To update your deployed backend:

1. Make changes to your code
2. Test locally
3. Commit and push to your repository
4. Deploy using your platform's deployment method
5. Test the updated functionality

Remember to update environment variables if needed and restart the service after deployment.
