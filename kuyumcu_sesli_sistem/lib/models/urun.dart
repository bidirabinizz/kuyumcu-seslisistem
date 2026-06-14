class Urun {
  final int id;
  final String ad;
  final String urunCinsi;
  final String urunKategorisi;
  final String islemBirimi;
  final double milyem;
  final double hasKarsiligi;
  final String renk;
  final int sira;
  final bool aktif;
  final String urunGrubu;

  Urun({
    required this.id,
    required this.ad,
    required this.urunCinsi,
    required this.urunKategorisi,
    required this.islemBirimi,
    required this.milyem,
    required this.hasKarsiligi,
    required this.renk,
    required this.sira,
    required this.aktif,
    required this.urunGrubu,
  });

  factory Urun.fromJson(Map<String, dynamic> json) {
    return Urun(
      id:             json['id'] as int,
      ad:             json['ad'] as String,
      urunCinsi:      json['urun_cinsi'] as String,
      urunKategorisi: json['urun_kategorisi'] as String,
      islemBirimi:    json['islem_birimi'] as String,
      milyem:         (json['milyem'] as num).toDouble(),
      hasKarsiligi:   (json['has_karsiligi'] as num).toDouble(),
      renk:           json['renk'] as String,
      sira:           json['sira'] as int,
      aktif:          json['aktif'] as bool,
      urunGrubu:      (json['urun_grubu'] as String?) ?? 'Diğer',
    );
  }

  bool get gramCinsinden => islemBirimi == 'GRAM';
}
