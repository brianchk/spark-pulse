module.exports = {
  apps: [
    {
      name: "pulse-api",
      script: "/bin/bash",
      args: "-c 'source .venv/bin/activate && uvicorn api.main:app --host 127.0.0.1 --port 8100 --reload'",
      cwd: "/Users/brian.chan/dev/spark-pulse",
      interpreter: "none",
      env: {
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "pulse-web",
      script: "/bin/bash",
      args: "-c 'npm run start -- -p 3002'",
      cwd: "/Users/brian.chan/dev/spark-pulse",
      interpreter: "none",
    },
  ],
};
