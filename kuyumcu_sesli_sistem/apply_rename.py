import sys

with open('lib/kasa_screen.dart', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace variables keeping 'PIRLANTA' string intact.
text = text.replace('pirlantaStok', 'urunStok')
text = text.replace('PirlantaStok', 'UrunStok')
text = text.replace('pirlanta_stok', 'urun_stok')
text = text.replace('seciliPirlantaId', 'seciliUrunStokId')
text = text.replace('onPirlantaSec', 'onUrunStokSec')
text = text.replace('pirlantaRes', 'stokRes')

with open('lib/kasa_screen.dart', 'w', encoding='utf-8') as f:
    f.write(text)

print('Restored Pirlanta -> UrunStok renames successfully.')
