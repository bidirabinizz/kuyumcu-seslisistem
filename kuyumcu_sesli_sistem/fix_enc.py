import sys

with open('lib/kasa_screen.dart', 'r', encoding='utf-8') as f:
    text = f.read()

reps = {
    'Äž': 'Ğ',
    'â”€': '─',
    'YÜKSEKLİÄİNİ': 'YÜKSEKLİĞİNİ', 
    'SAÄ': 'SAĞ',
    'SOLâ': 'SOL─',
    'â€': '', # sometimes other dashes
}

for k, v in reps.items():
    text = text.replace(k, v)

with open('lib/kasa_screen.dart', 'w', encoding='utf-8') as f:
    f.write(text)

print('Replaced additional known corrupted strings.')
