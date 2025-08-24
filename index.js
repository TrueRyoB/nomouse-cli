#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const clipboardy = require('clipboardy');
const chalk = require('chalk');
const { spawnSync } = require('child_process');

// Store the last generated/run file path
let lastFile = null;

// Template directory path
const templateDir = path.join(process.cwd(), '.nomouse-templates');

// Ensure template directory exists
fs.ensureDirSync(templateDir);

// Set program metadata
program
    .name('nms')
    .description('A CLI tool for competitive programmers to quickly create, execute, and copy files')
    .version('1.0.0');

// Generate command
program
    .command('gen <filename>')
    .description('Generate a new file based on an existing template')
    .action(async (filename) => {
        try {
            const ext = path.extname(filename);
            const templatePath = path.join(templateDir, `template${ext}`);
            
            if (!await fs.pathExists(templatePath)) {
                console.log(chalk.yellow(`No template found for ${ext} extension. Use 'nms set ${ext}' to create one.`));
                return;
            }
            
            const template = await fs.readFile(templatePath, 'utf8');
            await fs.writeFile(filename, template);
            
            lastFile = filename;
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
            const templatePath = path.join(templateDir, `template${ext}`);
            
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
            
            lastFile = filename;
            const ext = path.extname(filename);
            
            console.log(chalk.blue(`Running ${filename}...`));
            
            // Handle different file types
            switch (ext) {
                case '.js':
                    console.log(chalk.gray('Running JavaScript file...'));
                    require('child_process').execSync(`node ${filename}`, { stdio: 'inherit' });
                    break;
                case '.py':
                    console.log(chalk.gray('Running Python file...'));
                    require('child_process').execSync(`python ${filename}`, { stdio: 'inherit' });
                    break;
                case '.cpp':
                case '.cc':
                case '.cxx':
                    console.log(chalk.gray('Compiling C++ file...'));
                    const outputName = filename.replace(ext, '');
                    spawnSync(`g++ -o ${outputName} ${filename}`, { stdio: 'inherit' });
                    console.log(chalk.gray('Running compiled file...'));
                    spawnSync(`./${outputName}`, { stdio: 'inherit' });
                    break;
                case '.c':
                    console.log(chalk.gray('Compiling C file...'));
                    const cOutputName = filename.replace(ext, '');
                    require('child_process').execSync(`gcc -o ${cOutputName} ${filename}`, { stdio: 'inherit' });
                    console.log(chalk.gray('Running compiled file...'));
                    require('child_process').execSync(`./${cOutputName}`, { stdio: 'inherit' });
                    break;
                case '.java':
                    console.log(chalk.gray('Compiling Java file...'));
                    const className = path.basename(filename, ext);
                    require('child_process').execSync(`javac ${filename}`, { stdio: 'inherit' });
                    console.log(chalk.gray('Running Java file...'));
                    require('child_process').execSync(`java ${className}`, { stdio: 'inherit' });
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
            if (!lastFile) {
                console.log(chalk.yellow('No file has been generated or run yet. Use "nms gen" or "nms run" first.'));
                return;
            }
            
            if (!await fs.pathExists(lastFile)) {
                console.error(chalk.red(`Last file ${lastFile} no longer exists`));
                return;
            }
            
            const content = await fs.readFile(lastFile, 'utf8');
            await clipboardy.write(content);
            
            console.log(chalk.green(`✓ Copied ${lastFile} content to clipboard`));
            console.log(chalk.gray(`File: ${lastFile}`));
            console.log(chalk.gray(`Size: ${content.length} characters`));
        } catch (error) {
            console.error(chalk.red(`Error copying file: ${error.message}`));
        }
    });

// Parse command line arguments
program.parse();