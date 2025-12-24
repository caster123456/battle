
module.exports = {
  apps: [
    {
      name: "classroom-battle-server",
      cwd: "/var/www/classroom-battle/server",
      script: "index.js",
      env: {
        PORT: 3001,
        HOST: "127.0.0.1",
        CORS_ORIGINS: "*" // when in production, set to https://your-domain.com
      }
    }
  ]
};
