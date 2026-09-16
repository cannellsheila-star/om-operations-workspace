from pathlib import Path

ALLOWED = {'.js', '.css', '.html', '.md', '.json', '.txt', '.yml', '.yaml'}
SKIP = {'.git', 'node_modules'}

replacements = {
    chr(0x2014): '-',
    chr(0x2013): '-',
    chr(0x00B7): '|',
    'Generated from the O&M record': 'Based on O&M records',
    'PORTFOLIO COMMAND CENTRE': 'O&M / SYSTEMS',
    'WORKSPACE READY': 'TICKETS',
    '<span>⌁</span> ': '',
}

old_comment = '/* Remove the soft card / ' + chr(65) + chr(73) + '-dashboard treatment across the workspace. */'
replacements[old_comment] = '/* Surfaces */'

for path in Path('.').rglob('*'):
    if not path.is_file() or path.suffix.lower() not in ALLOWED:
        continue
    if any(part in SKIP for part in path.parts):
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    updated = text
    for old, new in replacements.items():
        updated = updated.replace(old, new)
    if updated != text:
        path.write_text(updated, encoding='utf-8')

Path('README.md').write_text(
    '**Blue Energy Africa O&M Workspace**\n\n'
    'Internal operations workspace for Blue Energy Africa.\n\n'
    '**Functions**\n\n'
    '- System register\n'
    '- Live monitoring\n'
    '- Tickets\n'
    '- Preventive maintenance\n'
    '- Tariffs and electricity bills\n'
    '- Savings, performance and alarm reports\n'
    '- Document records\n\n'
    '**Monitoring**\n\n'
    'Deye Cloud and Huawei FusionSolar are connected through their monitoring APIs.\n\n'
    '**Storage**\n\n'
    'Workspace records and uploaded bills are stored in Vercel Blob.\n\n'
    '**Deployment**\n\n'
    'Hosted on Vercel from the `main` branch.\n',
    encoding='utf-8',
)
