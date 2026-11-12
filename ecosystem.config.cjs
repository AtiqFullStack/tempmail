module.exports = {
  apps: [
    {
      name: "fzeetechz-tempmail",
      cwd: "/srv/tempmail",
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 1117",
      instances: 1,
      exec_mode: "fork",
      node_args: "--max-old-space-size=384",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
      time: true,
      kill_timeout: 10000,
      min_uptime: "10s",
      max_restarts: 10,
    },
  ],
};
