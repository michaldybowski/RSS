import { redirect } from 'next/navigation';

import { ocen } from '@longevity/audit';

import { biezacaSesja } from '../../lib/aktor.ts';
import { nazwaOrganizacji, OPIS_POZIOMU, SCHEMAT } from '../../lib/dane.ts';
import { pobierzAudyty, pobierzCertyfikaty, pobierzUstalenia } from '../../lib/stan.ts';

export default async function Audyty() {
  const sesja = await biezacaSesja();
  if (sesja === undefined) redirect('/');

  const audyty = pobierzAudyty();
  const ustalenia = pobierzUstalenia();
  const certyfikaty = pobierzCertyfikaty();

  return (
    <>
      <header className="strona">
        <h1>Audyty</h1>
        <p>
          Schemat {SCHEMAT.nazwa}, wersja {SCHEMAT.wersja} · {SCHEMAT.kryteria.length} kryteriów
          w {SCHEMAT.domeny.length} domenach
        </p>
      </header>

      {audyty.map((audyt) => {
        const wynik = ocen(
          SCHEMAT,
          ustalenia.filter((ustalenie) => ustalenie.audytId === audyt.id),
        );
        const ocenionych = SCHEMAT.kryteria.length - wynik.bezOceny.length;
        const moj = audyt.audytorId === sesja.audytorId;
        const certyfikat = certyfikaty.find((pozycja) => pozycja.audytId === audyt.id);

        return (
          <div className="karta" key={audyt.id}>
            <div className="warsztat-wiersz">
              <strong style={{ flex: 1 }}>{nazwaOrganizacji(audyt.organizationId)}</strong>
              <span className={`stan ${audyt.status === 'zamkniety' ? 'po' : 'trwa'}`}>
                {audyt.status === 'zamkniety' ? 'zamknięty' : 'w toku'}
              </span>
            </div>

            <p className="mala" style={{ margin: '10px 0 0' }}>
              Ocenionych {ocenionych} z {SCHEMAT.kryteria.length}
              {ocenionych > 0 && ` · wynik ${wynik.wynikProcent}% (${OPIS_POZIOMU[wynik.poziom]})`}
              {certyfikat !== undefined && ` · certyfikat ${certyfikat.numer}`}
              {!moj && ' · prowadzi inny audytor'}
            </p>

            <div className="akcje" style={{ marginTop: 14 }}>
              <a className={moj ? 'przycisk' : 'przycisk wtorny'} href={`/audyty/${audyt.id}`}>
                {moj ? 'Otwórz arkusz' : 'Zobacz (cudzy audyt)'}
              </a>
            </div>
          </div>
        );
      })}
    </>
  );
}
