/* oxlint-disable no-console */
/* oxlint-disable @typescript-oxlint/no-var-requires */
/* oxlint-disable no-undef */
const { exec } = require("child_process");
const { readdirSync, existsSync, rmSync, mkdirSync, copyFileSync } = require("fs");

const getDirectories = (source) =>
  readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

/**
 * Executes a shell command and return it as a Promise.
 * @param cmd {string}
 * @return {Promise<string>}
 */
function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout ? stdout : stderr);
      }
    });
  });
}

function removeDir(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

async function build() {
  // Clean previous build
  console.log("Clean previous build…");

  removeDir("./build/server");
  removeDir("./build/plugins");

  const d = getDirectories("./plugins");

  // Compile server and shared
  console.log("Compiling…");
  await Promise.all([
    execAsync(
      "yarn babel --extensions .ts,.tsx --quiet -d ./build/server ./server"
    ),
    execAsync(
      "yarn babel --extensions .ts,.tsx --quiet -d ./build/shared ./shared"
    ),
  ]);

  for (const plugin of d) {
    const hasServer = existsSync(`./plugins/${plugin}/server`);

    if (hasServer) {
      await execAsync(
        `yarn babel --extensions .ts,.tsx --quiet -d "./build/plugins/${plugin}/server" "./plugins/${plugin}/server"`
      );
    }

    const hasShared = existsSync(`./plugins/${plugin}/shared`);

    if (hasShared) {
      await execAsync(
        `yarn babel --extensions .ts,.tsx --quiet -d "./build/plugins/${plugin}/shared" "./plugins/${plugin}/shared"`
      );
    }
  }

  // Copy static files
  console.log("Copying static files…");

  // Ensure base directories exist
  mkdirSync("./build/server/collaboration", { recursive: true });
  mkdirSync("./build/plugins", { recursive: true });

  if (existsSync("./server/collaboration/Procfile")) {
    copyFileSync(
      "./server/collaboration/Procfile",
      "./build/server/collaboration/Procfile"
    );
  }

  if (existsSync("./server/static/error.dev.html")) {
    mkdirSync("./build/server", { recursive: true });
    copyFileSync(
      "./server/static/error.dev.html",
      "./build/server/error.dev.html"
    );
  }

  if (existsSync("./server/static/error.prod.html")) {
    mkdirSync("./build/server", { recursive: true });
    copyFileSync(
      "./server/static/error.prod.html",
      "./build/server/error.prod.html"
    );
  }

  mkdirSync("./build", { recursive: true });
  copyFileSync("package.json", "./build/package.json");

  for (const plugin of d) {
    const pluginDir = `./plugins/${plugin}`;
    const buildPluginDir = `./build/plugins/${plugin}`;

    mkdirSync(buildPluginDir, { recursive: true });

    const pluginJsonPath = `${pluginDir}/plugin.json`;
    if (existsSync(pluginJsonPath)) {
      copyFileSync(pluginJsonPath, `${buildPluginDir}/plugin.json`);
    }
  }

  console.log("Done!");
}

void build();
