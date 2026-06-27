import sys

with open('lib/kasa_screen.dart', 'r', encoding='utf-8') as f:
    text = f.read()

reps = {
    'ğŸ“ ': '📌',
    'â­ ': '⭐',
    'ALIÅž': 'ALIŞ',
    'SATIÅž': 'SATIŞ',
    'â†“': '↓',
    'â†‘': '↑',
    'â‚¬': '€',
    'â‰ˆ': '≈',
    'âž”': '➔',
    'â† ': '←',
    'YÜKSEKLİÄžİNİ': 'YÜKSEKLİĞİNİ'
}

for k, v in reps.items():
    text = text.replace(k, v)

with open('lib/kasa_screen.dart', 'w', encoding='utf-8') as f:
    f.write(text)

print('Replaced final known corrupted strings.')
