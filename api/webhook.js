export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { judul, pesan } = req.body;

    // URL langsung ke Realtime Database kamu
    const firebaseUrl = "https://vipercell-fc50e-default-rtdb.asia-southeast1.firebasedatabase.app/pembayaran_terakhir.json";

    try {
      // Mengirim data ke Firebase Database menggunakan PUT (menimpa data lama)
      await fetch(firebaseUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          judul: judul || "Pembayaran",
          pesan: pesan || "Nominal tidak terbaca",
          waktu_masuk: Date.now()
        })
      });

      return res.status(200).json({ success: true, message: 'Berhasil dikirim ke Firebase Vipercell' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Gagal menghubungi database' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: 'Metode tidak diizinkan' });
  }
}
