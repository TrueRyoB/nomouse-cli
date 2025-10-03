#!/usr/bin/env node

import { program } from 'commander';
import fs from 'fs-extra';
import path from "path";
import envPaths from "env-paths";
import clipboardy from 'clipboardy';
import chalk from 'chalk';
import { spawnSync } from 'child_process';

// Persistent storage paths
const storageDir = envPaths("nomouse").data;
const templatesDir = path.join(storageDir, 'templates');
const stateFile = path.join(storageDir, 'state.json');

// Ensure storage directories exist
fs.ensureDirSync(storageDir);
fs.ensureDirSync(templatesDir);

// Load persistent state
function loadState() {
    try {
        if (fs.existsSync(stateFile)) {
            return fs.readJsonSync(stateFile);
        }
    } catch (error) {
        console.log(chalk.yellow('Warning: Could not load previous state, starting fresh.'));
    }
    return {
        lastGenerated: null,
        lastRun: null,
        stats: { generated: 0, run: 0 },
        fileTimestamps: {}
    };
}

// Save persistent state
function saveState(state) {
    try {
        fs.writeJsonSync(stateFile, state, { spaces: 2 });
    } catch (error) {
        console.error(chalk.red(`Error saving state: ${error.message}`));
    }
}

// Get current state
let state = loadState();

// Helper function to get time ago string
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// Register file generation timestamp
function registerFileGenerated(filename) {
    const ts = new Date().toISOString();
    state.fileTimestamps[filename] = {};
    state.fileTimestamps[filename].generated = ts;
    state.fileTimestamps[filename].resumed = ts;
    saveState(state);
    return ts;
}

// Register file last-winded timestamp
function registerFileWinded(filename) {
    if (!state.fileTimestamps[filename]) return;
    const ts = new Date().toISOString();
    state.fileTimestamps[filename].lastWinded = ts;
    saveState(state);
    return ts;
}

function pauseTimer(filename) {
    if (!state.fileTimestamps[filename]) return;
    const ts = new Date().toISOString();
    state.fileTimestamps[filename].paused = ts;
    saveState(state);
    return ts;
}

function resumeTimer(filename) {
    if (!state.fileTimestamps[filename]) return 0;
    if (!state.fileTimestamps[filename].paused) return -1;
    const elapsed = new Date()-new Date(state.fileTimestamps[filename].paused);
    const ts = new Date().toISOString();
    state.fileTimestamps[filename].resumed = ts;
    state.fileTimestamps[filename].paused = null;
    state.fileTimestamps[filename].blank = elapsed;
    saveState(state);
    return Math.floor(elapsed / 1000);
}

function retrieveSecondsSpent(filename) {
    if (!state.fileTimestamps[filename]) return -1;
    const spent = (state.fileTimestamps[filename].paused) 
        ? new Date(state.fileTimestamps[filename].paused) - new Date(state.fileTimestamps[filename].generated) + (state.fileTimestamps[filename].blank || 0)
        : new Date() - new Date(state.fileTimestamps[filename].generated) + (state.fileTimestamps[filename].blank || 0);
    return Math.floor(spent / 1000);
}

function retrieveSecondsSinceLastWind(filename) {
    if (!state.fileTimestamps[filename] || !state.fileTimestamps[filename].lastWinded) return -1;
    const lastWinded = new Date(state.fileTimestamps[filename].lastWinded);
    const elapsed = new Date() - lastWinded;
    return Math.floor(elapsed / 1000);
}

function getFileTimestamps(filename) {
    return state.fileTimestamps[filename] || null;
}

// Read package.json for metadata
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

// Set program metadata
program
    .name('nms')
    .description('A CLI tool for competitive programmers to quickly create, execute, and copy files')
    .version(packageJson.version, '-v, --version');

// Generate command
program
    .command('gen <filename>')
    .description('Generate a new file based on an existing template')
    .action(async (filename) => {
        try {
            const ext = path.extname(filename);
            const templatePath = path.join(templatesDir, `template${ext}`);
            
            if (!await fs.pathExists(templatePath)) {
                console.log(chalk.yellow(`No template found for ${ext} extension. Use 'nms set ${ext}' to create one.`));
                return;
            }
            
            const template = await fs.readFile(templatePath, 'utf8');
            await fs.writeFile(filename, template);
            
            state.lastGenerated = filename;
            state.stats.generated++;
            registerFileGenerated(filename);
            saveState(state);
            
            console.log(chalk.green(`✓ Generated ${filename} from template`));
        } catch (error) {
            console.error(chalk.red(`Error generating file: ${error.message}`));
        }
    });

// Set template command
program
    .command('set <extension>')
    .description('Set a template file for each file extension')
    .action(async (extension) => {
        try {
            const ext = extension.startsWith('.') ? extension : `.${extension}`;
            const templatePath = path.join(templatesDir, `template${ext}`);

            if (await fs.pathExists(templatePath)) {
                try {
                    const content = await fs.readFile(templatePath, 'utf8');
                    clipboardy.writeSync(content);
                    console.log(chalk.yellow('The existing template is copied to your clipboard. Overwriting...'));
                }
                catch (error) {
                    console.error(chalk.red(`Error copying template: ${error.message}`));
                }
            }
            
            console.log(chalk.blue(`Setting template for ${ext} extension...`));
            console.log(chalk.gray('Please paste your template code and press .end to finish:'));
            
            // Read from stdin with Windows-compatible approach
            let template = '';
            
            process.stdin.setEncoding('utf8');
            process.stdin.setRawMode(false);
            
            const onData = (chunk) => {
                const data = chunk.toString();
                
                // Check for double empty line (Enter twice) to end input
                if (data.trim() === ".end") {
                    process.stdin.removeListener('data', onData);
                    process.stdin.pause();
                    saveTemplate();
                } else {
                    template += data;
                }
            };
            
            const saveTemplate = async () => {
                try {
                    // Remove trailing newlines and save
                    const cleanTemplate = template.trim();
                    await fs.writeFile(templatePath, cleanTemplate);
                    console.log(chalk.green(`✓ Template for ${ext} saved successfully`));
                    process.exit(0);
                } catch (error) {
                    console.error(chalk.red(`Error saving template: ${error.message}`));
                    process.exit(1);
                }
            };
            
            process.stdin.on('data', onData);
            process.stdin.resume();
            
            // Alternative: Listen for Ctrl+C to cancel
            process.on('SIGINT', () => {
                console.log(chalk.yellow('\nTemplate creation cancelled.'));
                process.exit(0);
            });
            
        } catch (error) {
            console.error(chalk.red(`Error setting template: ${error.message}`));
        }
    });

// Run command
program
    .command('run <filename>')
    .description('Compiles and runs a file')
    .action(async (filename) => {
        try {
            if (!await fs.pathExists(filename)) {
                console.error(chalk.red(`File ${filename} does not exist`));
                return;
            }
            
            state.lastRun = filename;
            state.stats.run++;
            saveState(state);
            
            const ext = path.extname(filename);
            
            console.log(chalk.blue(`Running ${filename}...`));
            
            // Handle different file types
            switch (ext) {
                case '.js':
                    console.log(chalk.gray('Running JavaScript file...'));
                    const jsResult = spawnSync(`node`, [filename], { 
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (jsResult.status !== 0) {
                        console.error(chalk.red(`✗ JavaScript execution failed with exit code ${jsResult.status}`));
                        return;
                    }
                    break;
                case '.py':
                    console.log(chalk.gray('Running Python file...'));
                    const pyResult = spawnSync(`python`, [filename], { 
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (pyResult.status !== 0) {
                        console.error(chalk.red(`✗ Python execution failed with exit code ${pyResult.status}`));
                        return;
                    }
                    break;
                case '.cpp':
                case '.cc':
                case '.cxx':
                    console.log(chalk.gray('Compiling C++ file...'));
                    const outputName = filename.replace(ext, '');
                    const compileResult = spawnSync(`g++`, ['-o', outputName, filename], { 
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (compileResult.status !== 0) {
                        console.error(chalk.red(`✗ Compilation failed with exit code ${compileResult.status}`));
                        return;
                    }
                    
                    console.log(chalk.gray('Running compiled file...'));
                    const runResult = spawnSync(outputName, { 
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (runResult.status !== 0) {
                        console.error(chalk.red(`✗ Program exited with code ${runResult.status}`));
                        return;
                    }
                    break;
                case '.c':
                    console.log(chalk.gray('Compiling C file...'));
                    const cOutputName = filename.replace(ext, '');
                    const cCompileResult = spawnSync(`gcc`, ['-o', cOutputName, filename], { 
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (cCompileResult.status !== 0) {
                        console.error(chalk.red(`✗ Compilation failed with exit code ${cCompileResult.status}`));
                        return;
                    }
                    
                    console.log(chalk.gray('Running compiled file...'));
                    const cRunResult = spawnSync(`./${cOutputName}`, { 
                        stdio: 'pipe',
                        shell: true,
                        encoding: 'utf8'
                    });
                    
                    if (cRunResult.status !== 0) {
                        console.error(chalk.red(`✗ Program exited with code ${cRunResult.status}`));
                        if (cRunResult.stderr) {
                            console.error(chalk.red(cRunResult.stderr));
                        }
                        return;
                    }
                    
                    // Colorize output
                    if (cRunResult.stdout) {
                        console.log(chalk.cyan('Output:'));
                        console.log(chalk.white(cRunResult.stdout));
                    }
                    break;
                case '.java':
                    console.log(chalk.gray('Compiling Java file...'));
                    const className = path.basename(filename, ext);
                    const javaCompileResult = spawnSync(`javac`, [filename], { 
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (javaCompileResult.status !== 0) {
                        console.error(chalk.red(`✗ Compilation failed with exit code ${javaCompileResult.status}`));
                        return;
                    }
                    
                    console.log(chalk.gray('Running Java file...'));
                    const javaRunResult = spawnSync(`java`, [className], { 
                        stdio: 'pipe',
                        shell: true,
                        encoding: 'utf8'
                    });
                    
                    if (javaRunResult.status !== 0) {
                        console.error(chalk.red(`✗ Program exited with code ${javaRunResult.status}`));
                        if (javaRunResult.stderr) {
                            console.error(chalk.red(javaRunResult.stderr));
                        }
                        return;
                    }
                    
                    // Colorize output
                    if (javaRunResult.stdout) {
                        console.log(chalk.cyan('Output:'));
                        console.log(chalk.white(javaRunResult.stdout));
                    }
                    break;
                default:
                    console.log(chalk.yellow(`No specific test handler for ${ext} files. File exists and is ready.`));
            }
            
            console.log(chalk.green(`✓ Run completed for ${filename}`));
        } catch (error) {
            console.error(chalk.red(`Error running file: ${error.message}`));
        }
    });

// Wind command
program
    .command('wind')
    .description('Copy source code of the last generated/run file using nomouse')
    .action(async () => {
        try {
            if (!state.lastRun && !state.lastGenerated) {
                console.log(chalk.yellow('No file has been generated or run yet. Use "nms gen" or "nms run" first.'));
                return;
            }
            
            // Prefer last run file, fallback to last generated
            const targetFile = state.lastRun || state.lastGenerated;
            
            if (!await fs.pathExists(targetFile)) {
                console.error(chalk.red(`Last file ${targetFile} no longer exists`));
                return;
            }
            
            const content = await fs.readFile(targetFile, 'utf8');
            clipboardy.writeSync(content);
            
            // Calculate time since last wind BEFORE setting new timestamp
            const sinceLastWind = retrieveSecondsSinceLastWind(targetFile);
            
            // Register the winded timestamp
            registerFileWinded(targetFile);
            
            console.log(chalk.green(`✓ Copied ${targetFile} content to clipboard`));
            console.log(chalk.gray(`File: ${targetFile}`));
            console.log(chalk.gray(`Total time spent: ${retrieveSecondsSpent(targetFile)} seconds`));

            if(sinceLastWind >= 0) console.log(chalk.gray(`Since last wind: ${sinceLastWind} seconds`));
        } catch (error) {
            console.error(chalk.red(`Error copying file: ${error.message}`));
        }
    });

// Status command
program
    .command('status')
    .description('Show current CLI status and statistics')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 Nomouse CLI Status'));
            console.log(chalk.gray('─'.repeat(40)));
            
            if (state.lastGenerated) {
                console.log(chalk.green(`📁 Last Generated: ${state.lastGenerated}`));
            } else {
                console.log(chalk.yellow('📁 Last Generated: None'));
            }
            
            if (state.lastRun) {
                console.log(chalk.green(`▶️  Last Run: ${state.lastRun}`));
            } else {
                console.log(chalk.yellow('▶️  Last Run: None'));
            }
            
            console.log(chalk.blue(`📈 Statistics:`));
            console.log(chalk.gray(`   Generated: ${state.stats.generated} files`));
            console.log(chalk.gray(`   Run: ${state.stats.run} files`));
            console.log(chalk.gray(`   Tracked: ${Object.keys(state.fileTimestamps).length} files`));
            
            // Show available templates
            const templates = await fs.readdir(templatesDir);
            if (templates.length > 0) {
                console.log(chalk.blue(`📋 Available Templates:`));
                templates.forEach(template => {
                    const ext = template.replace('template', '');
                    console.log(chalk.gray(`   ${ext}`));
                });
            } else {
                console.log(chalk.yellow('📋 No templates set yet. Use "nms set <extension>" to create one.'));
            }
            
            console.log(chalk.gray('─'.repeat(40)));
        } catch (error) {
            console.error(chalk.red(`Error showing status: ${error.message}`));
        }
    });

program
    .command('pause')
    .description('pause the timer running on the file indicated')
    .action(async () => {
        try {
            if (!state.lastRun && !state.lastGenerated) {
                console.log(chalk.yellow('No file has been generated or run yet. Use "nms gen" or "nms run" first.'));
                return;
            }
        }
        catch (error) {
            console.error(chalk.red(`Error pausing timer: ${error.message}`));
        }

        const targetFile = state.lastRun || state.lastGenerated;

        if (!await fs.pathExists(targetFile)) {
            console.error(chalk.red(`Last file ${targetFile} no longer exists`));
            return;
        }

        pauseTimer(targetFile); 

        console.log(chalk.green(`✓ Paused timer for ${targetFile}`));
    });

program
    .command('resume')
    .description('resume the timer running on the file indicated')
    .action(async () => {
        try {
            if (!state.lastRun && !state.lastGenerated) {
                console.log(chalk.yellow('No file has been generated or run yet. Use "nms gen" or "nms run" first.'));
                return;
            }
        }
        catch (error) {
            console.error(chalk.red(`Error resuming timer: ${error.message}`));
        }

        const targetFile = state.lastRun || state.lastGenerated;

        if (!await fs.pathExists(targetFile)) {
            console.error(chalk.red(`Last file ${targetFile} no longer exists`));
            return;
        }

        const elapsed = resumeTimer(targetFile);
        if(elapsed === -1) {
            console.log(chalk.yellow('Timer is already running'));
            return;
        }
        if(elapsed === 0) {
            console.log(chalk.yellow('No file has been active yet'));
            return;
        }

        console.log(chalk.green(`✓ Resumed timer for ${targetFile}`));
        console.log(chalk.gray(`Elapsed time: ${elapsed} seconds`));
    });

// Clear command
program
    .command('clear')
    .description('Clear logs and messages from a command-line interface')
    .action(async () => {
        const cmd = process.platform === "win32" ? "cls" : "clear";
        spawnSync(cmd, { stdio: "inherit", shell:true })
    });


// Parse command line arguments
program.parse();