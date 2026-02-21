import fs from 'node:fs';

const text = fs.readFileSync('workspaces_diff.patch', 'utf8');
const chunks = text.split(/(?=\n@@ )/g);

let newPatch = chunks[0];
for (let i = 1; i < chunks.length; i++) {
  const match = chunks[i].match(/^@@ -\d+,\d+ \+(\d+),\d+ @@/);
  if (match) {
    const lineNum = parseInt(match[1], 10);
    // Only keep hunks modifying lines < 20 (for imports) or >= 1700 (for Action Jobs)
    if (lineNum < 20 || lineNum >= 1700) {
      newPatch += chunks[i];
    }
  }
}

fs.writeFileSync('clean_workspaces.patch', newPatch);
