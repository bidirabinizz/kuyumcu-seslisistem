class Urun {
  final int id;
  final String ad;
  final String urunCinsi;
  final String urunKategorisi;
  final String islemBirimi;
  final double milyem;
  final double alisMillyem;
  final double satisMillyem;
  final double hasKarsiligi;
  final String renk;
  final int sira;
  final bool aktif;
  final String urunGrubu;
  final bool mobilAktif;
  final bool favori;
  final bool stokTakibi;

  Urun({
    required this.id,
    required this.ad,
    required this.urunCinsi,
    required this.urunKategorisi,
    required this.islemBirimi,
    required this.milyem,
    required this.alisMillyem,
    required this.satisMillyem,
    required this.hasKarsiligi,
    required this.renk,
    required this.sira,
    required this.aktif,
    required this.urunGrubu,
    required this.mobilAktif,
    required this.favori,
    required this.stokTakibi,
  });

  factory Urun.fromJson(Map<String, dynamic> json) {
    return Urun(
      id:             json['id'] as int,
      ad:             json['ad'] as String,
      urunCinsi:      json['urun_cinsi'] as String,
      urunKategorisi: json['urun_kategorisi'] as String,
      islemBirimi:    json['islem_birimi'] as String,
      milyem:         (json['milyem'] as num).toDouble(),
      alisMillyem:    (json['alis_milyem'] as num? ?? 0).toDouble(),
      satisMillyem:   (json['satis_milyem'] as num? ?? 0).toDouble(),
      hasKarsiligi:   (json['has_karsiligi'] as num).toDouble(),
      renk:           json['renk'] as String,
      sira:           json['sira'] as int,
      aktif:          json['aktif'] as bool,
      urunGrubu:      (json['urun_grubu'] as String?) ?? 'Diğer',
      mobilAktif:     (json['mobil_aktif'] as bool?) ?? true,
      favori:         (json['favori'] as bool?) ?? false,
      stokTakibi:     (json['stok_takibi'] as bool?) ?? false,
    );
  }

  /// İşlem tipine göre doğru milyemi döner.
  /// [islemTipi] 'ALIS' veya 'SATIS' olabilir.
  double milyemForIslem(String islemTipi) {
    if (islemTipi == 'ALIS') {
      return alisMillyem > 0 ? alisMillyem : milyem;
    } else {
      return satisMillyem > 0 ? satisMillyem : milyem;
    }
  }

  bool get gramCinsinden => islemBirimi == 'GRAM';
}
