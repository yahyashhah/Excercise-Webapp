const fs = require('fs');
const file = 'components/calendar/workout-editor-panel.tsx';
let code = fs.readFileSync(file, 'utf8');

const regex = /<DropdownMenuTrigger asChild>[\s\S]*?<\/DropdownMenuTrigger>/m;
const replacement = `<DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"><Settings className="h-4 w-4" /></DropdownMenuTrigger>`;

if (code.match(regex)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync(file, code);
  console.log("Fixed DropdownMenuTrigger");
} else {
  console.log("Could not find DropdownMenuTrigger");
}
