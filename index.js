#!/usr/bin/env node

import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import clipboardy from 'clipboardy';
import chalk from 'chalk';
import { spawnSync } from 'child_process';

// Persistent storage paths
const storageDir = path.join(process.cwd(), '.nomouse-data');
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
    return { lastFile: null, lastGenerated: null, lastRun: null, stats: { generated: 0, run: 0 } };
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

// Read package.json for metadata
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

// Set program metadata
program
    .name('nyn')
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
                console.log(chalk.yellow(`No template found for ${ext} extension. Use 'nyn set ${ext}' to create one.`));
                return;
            }
            
            const template = await fs.readFile(templatePath, 'utf8');
            await fs.writeFile(filename, template);
            
            state.lastGenerated = filename;
            state.stats.generated++;
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
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (cRunResult.status !== 0) {
                        console.error(chalk.red(`✗ Program exited with code ${cRunResult.status}`));
                        return;
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
                        stdio: 'inherit',
                        shell: true 
                    });
                    
                    if (javaRunResult.status !== 0) {
                        console.error(chalk.red(`✗ Program exited with code ${javaRunResult.status}`));
                        return;
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
                console.log(chalk.yellow('No file has been generated or run yet. Use "nyn gen" or "nyn run" first.'));
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
            
            console.log(chalk.green(`✓ Copied ${targetFile} content to clipboard`));
            console.log(chalk.gray(`File: ${targetFile}`));
            console.log(chalk.gray(`Size: ${content.length} characters`));
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
            
            // Show available templates
            const templates = await fs.readdir(templatesDir);
            if (templates.length > 0) {
                console.log(chalk.blue(`📋 Available Templates:`));
                templates.forEach(template => {
                    const ext = template.replace('template', '');
                    console.log(chalk.gray(`   ${ext}`));
                });
            } else {
                console.log(chalk.yellow('📋 No templates set yet. Use "nyn set <extension>" to create one.'));
            }
            
            console.log(chalk.gray('─'.repeat(40)));
        } catch (error) {
            console.error(chalk.red(`Error showing status: ${error.message}`));
        }
    });

// Parse command line arguments
program.parse();