import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const bin = name => windows ? name + '.exe' : name;
const join = (...parts) => path.join(root, ...parts);
const stages = { legacy: 8, target: 25 };
const help = `Route Health workshop
  doctor                          Check runtimes, Git and Node
  init                            Create a local Git baseline after unpacking
  warmup                          Install React dependencies and build the Java 8 starter
  sample <walkthrough|daily|next-day>   Copy a sample into inbox/
  process <legacy|target> [batch]  Process the inbox, or one named drop or fixture
  start <legacy|target> [port]     Serve the app; seed daily if there are no reports
  verify <legacy|target> <batch>   Check a processed fixture against expected results
  build <legacy|target> [react|angular]  Package a JAR from the current sources
  reset <legacy|target>            Clear generated reports for one runtime`;

function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.signal === 'SIGINT') process.exit(130);
  if (result.status !== 0) throw new Error(`${path.basename(exe)} exited with ${result.status ?? result.signal}`);
}

// Windows requires the command interpreter for .cmd wrappers. Only fixed build
// commands and validated flags are passed here. Working directories use cwd.
function wrapper(name, args, options) {
  if (windows) run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', name + '.cmd', ...args], options);
  else run(name === 'mvnw' ? './mvnw' : name, args, options);
}

function findJdk(version) {
  const key = 'JAVA' + version + '_HOME';
  const preferred = process.env[key];
  const paths = [process.env.JAVA_HOME];
  if (process.platform === 'darwin') {
    const mac = spawnSync('/usr/libexec/java_home', ['-v', version === 8 ? '1.8' : String(version)], { encoding: 'utf8' });
    if (mac.status === 0) paths.push(mac.stdout.trim());
  }
  if (windows) {
    const installers = version === 8 ? ['Java', 'Eclipse Adoptium', 'Zulu'] : ['Amazon Corretto'];
    for (const installer of installers) {
      const base = path.join(process.env.ProgramFiles || 'C:\\Program Files', installer);
      if (fs.existsSync(base)) paths.push(...fs.readdirSync(base).sort().reverse().map(n => path.join(base, n)));
    }
  }
  const candidates = preferred ? [path.join(preferred, 'bin', bin('java'))] :
    [...paths.filter(Boolean).map(home => path.join(home, 'bin', bin('java'))), bin('java')];
  for (const exe of new Set(candidates)) {
    const probe = spawnSync(exe, ['-XshowSettings:properties', '-version'], { encoding: 'utf8' });
    if (probe.status !== 0) continue;
    const info = probe.stderr + probe.stdout;
    const spec = info.match(/^\s*java\.specification\.version\s*=\s*(\S+)/m)?.[1];
    let home = info.match(/^\s*java\.home\s*=\s*(.+)$/m)?.[1].trim();
    if (!home || spec !== (version === 8 ? '1.8' : '25') || (version === 25 && !/Corretto/i.test(info))) continue;
    if (path.basename(home).toLowerCase() === 'jre') home = path.dirname(home);
    if (!fs.existsSync(path.join(home, 'bin', bin('javac')))) continue;
    const versionLine = info.split(/\r?\n/).find(s => /^(openjdk|java) version/.test(s));
    const vendor = info.match(/^\s*java\.vendor\s*=\s*(.+)$/m)?.[1].trim();
    return { exe: path.join(home, 'bin', bin('java')), home, description: [versionLine, vendor].filter(Boolean).join(' | ') };
  }
  throw new Error(`Set ${key} to the ${version === 25 ? 'Amazon Corretto 25' : 'Java 8'} JDK directory.`);
}

function jdkEnv(jdk) {
  return { ...process.env, JAVA_HOME: jdk.home, PATH: path.join(jdk.home, 'bin') + path.delimiter + (process.env.PATH || '') };
}

function doctor() {
  let ok = true;
  for (const version of [8, 25]) {
    try {
      const jdk = findJdk(version);
      console.log(`JDK ${version}: ${jdk.description} | ${jdk.home}`);
    } catch (error) { console.error(error.message); ok = false; }
  }
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  console.log(git.status === 0 ? git.stdout.trim() : 'Git missing');
  const nodeOk = process.versions.node.split('.')[0] === '24';
  console.log('Node ' + process.version + (nodeOk ? '' : ' | select the workshop Node 24 LTS runtime'));
  console.log('In the Codex session, confirm @codemod is selectable before class.');
  if (!ok || !nodeOk || git.status !== 0) process.exitCode = 1;
}

function baseline() {
  if (fs.existsSync(join('.git'))) { console.log('Local Git checkout already present.'); return; }
  run('git', ['init', '-b', 'main']);
  run('git', ['add', '--', '.']);
  run('git', ['-c', 'user.name=Workshop Participant', '-c', 'user.email=workshop@example.invalid', 'commit', '-m', 'Start Route Health workshop']);
}

function slug(name) {
  if (!name || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error('Use a lowercase batch name with letters, digits, hyphen or underscore (without .csv).');
  return name;
}

function sample(name) {
  const from = join('fixtures', slug(name) + '.csv');
  const to = join('inbox', name + '.csv');
  if (!fs.existsSync(from)) throw new Error('Unknown sample: ' + name);
  fs.mkdirSync(join('inbox'), { recursive: true });
  fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  console.log('Dropped ' + to);
}

const reports = stage => join('work', stage, 'processed');
const jar = stage => join('dist', 'route-health-' + stage + '.jar');

function java(jdk, stage, args) {
  if (!fs.existsSync(jar(stage))) throw new Error('Build the ' + stage + ' JAR first.');
  run(jdk.exe, ['-jar', jar(stage), ...args], { env: jdkEnv(jdk) });
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function processBatch(stage, file, jdk) {
  const name = slug(path.parse(file).name);
  fs.mkdirSync(reports(stage), { recursive: true });
  const temp = fs.mkdtempSync(path.join(reports(stage), '.pending-'));
  const destination = path.join(reports(stage), name);
  try {
    java(jdk, stage, ['process', file, join('reference', 'routes.csv'), temp]);
    try {
      fs.renameSync(temp, destination);
    } catch (error) {
      if (!fs.existsSync(destination)) throw error;
      const same = ['summary.json', 'attempts.json', 'enriched.csv'].every(key =>
        fs.existsSync(path.join(destination, key)) && digest(path.join(destination, key)) === digest(path.join(temp, key)));
      if (!same) throw new Error(`Batch ${name} already exists with different results. Use a new batch name or reset ${stage}.`);
    }
    console.log('Processed ' + destination);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function processDrops(stage, name, jdk) {
  const inbox = join('inbox');
  if (name) {
    const file = slug(name) + '.csv';
    const location = fs.existsSync(path.join(inbox, file)) ? path.join(inbox, file) : join('fixtures', file);
    if (!fs.existsSync(location)) throw new Error('Missing batch: ' + file);
    processBatch(stage, location, jdk);
    return;
  }
  const files = fs.readdirSync(inbox).filter(file => file.endsWith('.csv')).sort();
  if (!files.length) throw new Error('Drop a CSV into inbox/ or use the sample command first.');
  for (const file of files) processBatch(stage, path.join(inbox, file), jdk);
}

function build(stage, ui, jdk) {
  if (!['react', 'angular'].includes(ui)) throw new Error('Choose react or angular for the web assets.');
  const frontend = join('ui-' + ui);
  const angular = ui === 'angular';
  if (angular && !fs.existsSync(path.join(frontend, 'package.json'))) {
    throw new Error('Create ui-angular during the frontend migration. Use "build target react" for the Java 25 checkpoint.');
  }
  const buildArgs = angular ? ['run', 'build', '--', '--output-path=dist'] : ['run', 'build'];
  wrapper('npm', buildArgs, { cwd: frontend });
  const output = angular && fs.existsSync(path.join(frontend, 'dist/browser/index.html')) ? 'dist/browser' : 'dist';
  if (!fs.existsSync(path.join(frontend, output, 'index.html'))) throw new Error('Frontend build is missing ' + output + '/index.html.');
  wrapper('mvnw', ['-B', 'clean', 'package', '-Dweb.assets=../ui-' + ui + '/' + output], { cwd: join('backend'), env: jdkEnv(jdk) });
  const classHeader = fs.readFileSync(join('backend', 'target', 'classes', 'workshop', 'Processor.class'));
  const release = classHeader.readUInt16BE(6) - 44;
  if (release !== stages[stage]) {
    throw new Error(`Compiler emitted Java ${release} bytecode. Set the Maven compiler release to ${stages[stage]} for ${stage}.`);
  }
  fs.mkdirSync(join('dist'), { recursive: true });
  fs.copyFileSync(join('backend', 'target', 'route-health.jar'), jar(stage));
  console.log('Packaged ' + jar(stage));
}

function main([command, stage, arg, ...extra]) {
  if (extra.length) throw new Error(help);
  if (!command || ['help', '--help', '-h'].includes(command)) { console.log(help); return; }
  if (command === 'doctor') return doctor();
  if (command === 'init') return baseline();
  if (command === 'sample') return sample(stage);
  if (command === 'warmup') {
    wrapper('npm', ['ci', '--no-audit', '--no-fund'], { cwd: join('ui-react') });
    return build('legacy', 'react', findJdk(8));
  }
  if (!Object.hasOwn(stages, stage)) throw new Error(help);
  if (command === 'reset') {
    fs.rmSync(reports(stage), { recursive: true, force: true });
    console.log('Cleared generated ' + stage + ' reports.');
    return;
  }
  if (command === 'verify') {
    run(process.execPath, [join('tools', 'verify.mjs'), slug(arg), path.join(reports(stage), arg)]);
    return;
  }
  const jdk = findJdk(stages[stage]);
  console.log(`${stage}: ${jdk.description} | ${jdk.home}`);
  if (command === 'process') return processDrops(stage, arg, jdk);
  if (command === 'build') {
    const hasAngularTarget = stage === 'target' && fs.existsSync(join('ui-angular', 'package.json'));
    return build(stage, arg || (hasAngularTarget ? 'angular' : 'react'), jdk);
  }
  if (command === 'start') {
    const port = Number(arg || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.');
    const hasBatch = fs.existsSync(reports(stage)) && fs.readdirSync(reports(stage)).some(n => fs.existsSync(path.join(reports(stage), n, 'summary.json')) && !n.startsWith('.'));
    if (!hasBatch) processDrops(stage, 'daily', jdk);
    return java(jdk, stage, ['serve', reports(stage), String(port)]);
  }
  throw new Error(help);
}

try { main(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
