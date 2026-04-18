class Personel {
  final int id;
  final String adSoyad;
  final String rol;

  Personel({required this.id, required this.adSoyad, required this.rol});

  factory Personel.fromJson(Map<String, dynamic> json) {
    return Personel(
      id: json['id'],
      adSoyad: json['ad_soyad'] ?? 'İsimsiz',
      rol: json['rol'] ?? 'Personel',
    );
  }

  // --- KRİTİK EKLEME: Nesne Eşitliği Kontrolü ---
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Personel && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}