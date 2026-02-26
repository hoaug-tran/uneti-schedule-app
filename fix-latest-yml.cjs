const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const latestYmlPath = path.join(__dirname, 'dist', 'latest.yml');
const packageJson = require('./package.json');

if (fs.existsSync(latestYmlPath)) {
    const content = fs.readFileSync(latestYmlPath, 'utf8');
    const data = yaml.load(content);

    if (!data.version) {
        console.log('[fix-latest-yml] Adding missing version field...');
        data.version = packageJson.version;

        const newContent = yaml.dump(data);
        fs.writeFileSync(latestYmlPath, newContent, 'utf8');
        console.log(`[fix-latest-yml] Fixed! Version: ${packageJson.version}`);
    } else {
        console.log('[fix-latest-yml] Version field already exists');
    }
} else {
    console.log('[fix-latest-yml] latest.yml not found');
}
