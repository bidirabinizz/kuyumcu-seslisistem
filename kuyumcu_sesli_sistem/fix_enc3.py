import sys
import re

with open('lib/kasa_screen.dart', 'r', encoding='utf-8') as f:
    text = f.read()

# I will replace exactly what is in remaining_corruptions.txt
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

print('Success.')
