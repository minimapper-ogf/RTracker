import subprocess
import sys
from datetime import datetime
from pathlib import Path

localtesting = 1
ROOT = Path(__file__).resolve().parent
LOCAL_DATA_ROOT = ROOT / 'data'
DATA_ROOT = LOCAL_DATA_ROOT if localtesting else Path('/var/www/rtracker/data')

SCRIPTS = [
    'games_core.py',
    'build_frontend.py',
]
MIDNIGHT_SCRIPTS = [
    'groups_core.py',
    'badges_core.py',
]


def run_script(script_name):
    print(f"Running {script_name}...")
    subprocess.run([sys.executable, str(ROOT / script_name)], check=True)


def main():
    now = datetime.utcnow()
    is_midnight = now.hour == 0 and now.minute < 5
    if len(sys.argv) > 1 and sys.argv[1] == '--force-midnight':
        is_midnight = True

    print(f"Manager start: {now.isoformat()} UTC")
    for script in SCRIPTS:
        run_script(script)

    if is_midnight:
        print("Midnight run: including groups and badges update.")
        for script in MIDNIGHT_SCRIPTS:
            run_script(script)
    else:
        print("Standard run: skipping groups and badges update.")

    run_script('build_frontend.py')
    print('Manager complete.')


if __name__ == '__main__':
    main()
