class Kategori {
  final int id;
  final String ad;
  final String etiket;
  final String renk;
  final int sira;
  final bool aktif;

  Kategori({
    required this.id,
    required this.ad,
    required this.etiket,
    required this.renk,
    required this.sira,
    required this.aktif,
  });

  factory Kategori.fromJson(Map<String, dynamic> json) {
    return Kategori(
      id:     json['id'] as int,
      ad:     json['ad'] as String,
      etiket: json['etiket'] as String,
      renk:   (json['renk'] as String?) ?? 'amber',
      sira:   (json['sira'] as int?) ?? 0,
      aktif:  (json['aktif'] as bool?) ?? true,
    );
  }
}
