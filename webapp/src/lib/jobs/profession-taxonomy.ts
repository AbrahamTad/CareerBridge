import type { ProfessionRecommendation, ProfessionTaxonomyItem } from './types'

const DEFAULT_EDUCATION = ['Gymnasium', 'YH', 'Bachelor', 'Master', 'Relevant experience']
const DEFAULT_LEVELS: ProfessionTaxonomyItem['careerLevel'] = ['Junior', 'Mid', 'Senior']
const DEFAULT_JOB_TYPES: ProfessionTaxonomyItem['jobTypes'] = ['jobb', 'LIA', 'praktik', 'internship', 'trainee']
const DEFAULT_SIGNALS: ProfessionTaxonomyItem['matchSignals'] = ['skills', 'experience', 'education', 'certificates', 'languages']

const CATEGORY_PROFESSIONS: Record<string, string> = {
  'Vård & omsorg': 'Undersköterska|Vårdbiträde|Hemtjänstpersonal|Sjuksköterska|Specialistsjuksköterska|Barnmorska|Läkare|Tandläkare|Tandsköterska|Tandhygienist|Fysioterapeut|Arbetsterapeut|Vårdadministratör|Medicinsk sekreterare|Ambulanssjukvårdare|Operationssjuksköterska|Distriktssköterska|Psykiatrisjuksköterska|Skötare psykiatri|Rehabiliteringsassistent|Vårdbiträde äldreomsorg|Omsorgsassistent|Hälso- och sjukvårdskurator|Dietist|Logoped',
  'LSS & funktionsstöd': 'Stödassistent|Stödpedagog|Personlig assistent|Boendestödjare|Omsorgsassistent|LSS-handläggare|Avlösare|Ledsagare|Kontaktperson|Aktivitetscoach LSS|Daglig verksamhet personal|Gruppboende personal|Serviceboende personal|Funktionsstödsassistent|Socialpedagog LSS|Behandlingsassistent LSS|Boendehandledare|Korttidsboende personal|Personligt ombud|Specialistundersköterska funktionsstöd|Arbetskonsulent daglig verksamhet|Verksamhetspedagog|Habiliteringsassistent|Omsorgspedagog|Stödperson',
  'Socialt arbete & socialpsykiatri': 'Socionom|Socialsekreterare|Biståndshandläggare|Behandlingsassistent|Behandlingspedagog|Socialpedagog|Kurator|Familjebehandlare|Fältsekreterare|Socialpsykiatri personal|Boendestödjare socialpsykiatri|Integrationshandläggare|Arbetsmarknadskonsulent|Kriminalvårdare|Frivårdsinspektör|Missbruksbehandlare|Ungdomsbehandlare|Skolkurator|Familjerådgivare|Budget- och skuldrådgivare|Barnutredare|Vuxenhandläggare|Försörjningsstödshandläggare|Adoptionshandläggare|Samhällsvägledare',
  'IT & Technology': 'Frontend Developer|Backend Developer|Full Stack Developer|Software Engineer|Systemutvecklare|Webbutvecklare|Mobilapputvecklare|QA Engineer|Test Automation Engineer|Mjukvarutestare|DevOps Engineer|Cloud Engineer|Platform Engineer|AI Engineer|Machine Learning Engineer|Data Engineer|Data Scientist|BI-utvecklare|IT-supporttekniker|Nätverkstekniker|Systemadministratör|IT-säkerhetsspecialist|UX Designer|UI Designer|Produktdesigner',
  'Engineering': 'Civilingenjör|Högskoleingenjör|Maskiningenjör|Elektroingenjör|Byggnadsingenjör|Energiingenjör|Miljöingenjör|Automationsingenjör|Kvalitetsingenjör|Produktionsingenjör|Processingenjör|Projektör|Konstruktör|CAD-konstruktör|Beräkningsingenjör|VVS-ingenjör|Geotekniker|Mättekniker|Driftingenjör|Underhållsingenjör|Systemingenjör|Testingenjör|Materialingenjör|Flygingenjör|Mariningenjör',
  'Education': 'Lärare|Förskollärare|Grundskollärare|Gymnasielärare|Ämneslärare|Speciallärare|Specialpedagog|Yrkeslärare|Modersmålslärare|SFI-lärare|Fritidspedagog|Elevassistent|Barnskötare|Studie- och yrkesvägledare|Skolledare|Rektor|Biträdande rektor|Utbildningsledare|Utbildningsadministratör|Pedagog|Lärarassistent|Skolbibliotekarie|Kulturskolelärare|Universitetsadjunkt|Doktorand',
  'Finance & Economics': 'Ekonom|Redovisningsekonom|Controller|Business Controller|Financial Controller|Revisor|Redovisningskonsult|Löneadministratör|Lönekonsult|Bankrådgivare|Finansanalytiker|Kredithandläggare|Försäkringsrådgivare|Skadereglerare|Inköpsekonom|Nationalekonom|Treasury Analyst|Compliance Officer finans|Riskanalytiker|Portföljförvaltare|Fondadministratör|Ekonomiassistent|Leverantörsreskontraekonom|Kundreskontraekonom|Skattehandläggare',
  'Administration': 'Administratör|Administrativ assistent|Kontorsassistent|Receptionist|Koordinator|Projektadministratör|Orderadministratör|Kundtjänstmedarbetare|Servicehandläggare|Registrator|Arkivarie|Nämndsekreterare|Medicinsk administratör|Skoladministratör|HR-administratör|Personaladministratör|Inköpsassistent|Logistikadministratör|Chefsassistent|Executive Assistant|Verksamhetskoordinator|Bemanningskoordinator|Bokningskoordinator|Dokumentcontroller|Office Manager',
  'Law & Government': 'Jurist|Advokat|Bolagsjurist|Förvaltningsjurist|Kommunjurist|Domstolshandläggare|Paralegal|Åklagare|Domare|Notarie|Utredare|Myndighetshandläggare|Kommunhandläggare|Försäkringsutredare|Skatteutredare|Policyanalytiker|Samhällsplanerare|Planarkitekt|Bygglovshandläggare|Miljöinspektör|Dataskyddsombud|Upphandlare|Offentlig inköpare|Politisk sekreterare|Diplomat',
  'Security & Defense': 'Polis|Soldat|Officer|Specialistofficer|Väktare|Ordningsvakt|Skyddsvakt|Säkerhetsvakt|Brandman|Kriminalvårdare|Tulltjänsteman|Kustbevakare|Säkerhetssamordnare|Säkerhetschef|Informationssäkerhetsspecialist|Cybersäkerhetsanalytiker|Risk Manager säkerhet|Larmoperatör|SOS-operatör|Bevakningsledare|Räddningstjänstpersonal|Flygplatskontrollant|Säkerhetsprövare|Beredskapssamordnare|Totalförsvarshandläggare',
  'Transport & Logistics': 'Lastbilschaufför|Bussförare|Taxiförare|Lokförare|Tågvärd|Spårvagnsförare|Pilot|Kabinpersonal|Sjökapten|Matros|Lagerarbetare|Truckförare|Terminalarbetare|Transportledare|Logistiker|Logistikkoordinator|Speditör|Distributionsförare|Budbilsförare|Trafikledare|Supply Chain Planner|Inköpare logistik|Lagerchef|Hamnarbetare|Flygplatsmedarbetare',
  'Construction & Trades': 'Elektriker|Snickare|Rörmokare|VVS-montör|Målare|Murare|Betongarbetare|Plattsättare|Golvläggare|Takläggare|Ställningsbyggare|Byggnadsarbetare|Anläggningsarbetare|Maskinförare|Grävmaskinist|Kranförare|Svetsare|Smed|Glasmästare|Ventilationsmontör|Låssmed|Fastighetstekniker|Serviceelektriker|Solcellsmontör|Arbetsledare bygg',
  'Manufacturing & Industry': 'Processoperatör|Produktionsoperatör|Maskinoperatör|Montör|CNC-operatör|Industrielektriker|Underhållstekniker|Drifttekniker|Produktionstekniker|Laboratorietekniker|Kvalitetstekniker|Lean-koordinator|Produktionsledare|Verkstadsarbetare|Industrimekaniker|Automationstekniker|Robotoperatör|Förpackningsoperatör|Livsmedelsoperatör|Gjuteriarbetare|Lackerare|Verktygsmakare|Processtekniker|Produktionsplanerare|Materialplanerare',
  'Retail & Sales': 'Butikssäljare|Butikschef|Kassamedarbetare|Varuplockare|Visual Merchandiser|Innesäljare|Utesäljare|Account Manager|Key Account Manager|Sales Development Representative|Affärsutvecklare|Försäljningschef|Kundrådgivare|Kundtjänstmedarbetare|E-handelskoordinator|E-commerce Manager|Produktspecialist|Bilförsäljare|B2B-säljare|Telefonförsäljare|Distriktschef detaljhandel|Apotekstekniker|Optikerassistent|Marknadsförsäljare|Category Manager',
  'Hospitality & Tourism': 'Kock|Kallskänka|Köksbiträde|Restaurangbiträde|Servitör|Servitris|Barista|Bartender|Hovmästare|Diskare|Hotellreceptionist|Konferensvärd|Hotellchef|Restaurangchef|Turistguide|Resesäljare|Reseledare|Eventkoordinator|Cateringmedarbetare|Bagare|Konditor|Sommelier|Housekeeping Manager|Campingvärd|Spa-terapeut',
  'Cleaning & Facility Services': 'Lokalvårdare|Städare|Hemstädare|Fönsterputsare|Saneringstekniker|Fastighetsskötare|Fastighetsvärd|Vaktmästare|Drifttekniker fastighet|Facility Manager|Parkarbetare|Trädgårdsarbetare|Kyrkogårdsarbetare|Återvinningsarbetare|Sophämtare|Tvätterimedarbetare|Servicevärd|Måltidsbiträde|Skolvaktmästare|Bovärd|Fastighetsförvaltare|Energitekniker fastighet|Ventilationstekniker|Skadedjurstekniker|Lokalvårdsledare',
  'Agriculture & Environment': 'Lantbrukare|Djurskötare|Djurvårdare|Veterinär|Veterinärassistent|Agronom|Landskapsarkitekt|Skogsmaskinförare|Skogsvårdare|Skogsarbetare|Trädgårdsmästare|Trädgårdsanläggare|Miljösamordnare|Miljökonsult|Miljövetare|Hållbarhetsspecialist|Naturvårdare|Parkförvaltare|Fiskodlare|Biolog|Ekolog|Avfallssamordnare|Vattenvårdare|Lantmästare|Geolog',
  'Media & Creative': 'Grafisk designer|Art Director|Copywriter|Content Writer|Journalist|Redaktör|Fotograf|Videograf|Filmklippare|Ljudtekniker|Producent|Produktionsledare media|Social Media Manager|Content Creator|Illustratör|Animator|Speldesigner|3D-artist|Inredningsdesigner|Industridesigner|Modedesigner|Kommunikatör|PR-konsult|Webbredaktör|Översättare',
  'Science & Research': 'Forskare|Forskningsassistent|Doktorand|Laboratorieingenjör|Laboratorieassistent|Biomedicinsk analytiker|Kemisk analytiker|Mikrobiolog|Biolog|Fysiker|Kemiker|Matematiker|Statistiker|Epidemiolog|Klinisk prövningsledare|Forskningskoordinator|Dataanalytiker forskning|Geovetare|Meteorolog|Oceanograf|Astronom|Materialforskare|Bioinformatiker|Forskningsingenjör|Vetenskaplig skribent',
  'Business & Management': 'VD|Verksamhetschef|Enhetschef|Avdelningschef|Projektledare|Programledare|Produktchef|Product Owner|Scrum Master|Managementkonsult|Verksamhetsutvecklare|Processledare|Affärsområdeschef|Strateg|Operations Manager|Kvalitetschef|Förändringsledare|Teamledare|Kontorschef|Konsultchef|Bemanningschef|Entreprenör|Franchisetagare|Servicechef|Platschef',
  'HR & Recruitment': 'HR-specialist|HR Business Partner|HR-chef|Rekryterare|Researcher rekrytering|Talent Acquisition Specialist|Bemanningskonsult|Lönespecialist|People Operations Specialist|Arbetsmiljöspecialist|Förhandlingschef|Organisationsutvecklare|Kompetensutvecklare|Employer Branding Specialist|Personalvetare|Karriärcoach|Jobbcoach|Arbetsförmedlare|Omställningsrådgivare|HR-administratör|Rehabkoordinator|Arbetsrättsspecialist|Learning and Development Specialist|Diversity and Inclusion Specialist|HR-analytiker',
  'Marketing & Communications': 'Marknadsförare|Digital Marketing Specialist|Marketing Manager|Kommunikatör|Kommunikationsstrateg|PR-specialist|Pressansvarig|SEO-specialist|SEM-specialist|CRM-specialist|Growth Marketer|Performance Marketing Specialist|Social Media Manager|Content Manager|Webbredaktör|Marketing Automation Specialist|Varumärkesstrateg|Event Manager|Community Manager|Produktmarknadsförare|Copywriter|Medieplanerare|Marknadsanalytiker|Influencer Marketing Manager|Internkommunikatör',
  'Customer Service & Support': 'Kundtjänstmedarbetare|Kundsupportmedarbetare|Teknisk supportmedarbetare|Customer Success Manager|Customer Success Specialist|Servicedeskmedarbetare|Supporttekniker|Receptionist|Telefonist|Ordermottagare|Bokningsagent|Kundrådgivare|Bankkundtjänstmedarbetare|Försäkringskundtjänstmedarbetare|Resesupportmedarbetare|Butikskundtjänstmedarbetare|First Line Support|Second Line Support|Onboarding Specialist|Customer Experience Manager|Servicekoordinator|Garantihandläggare|Reklamationshandläggare|Klientservicehandläggare|Medborgarservicehandläggare',
  'Procurement & Supply Chain': 'Inköpare|Strategisk inköpare|Operativ inköpare|Offentlig upphandlare|Upphandlingsjurist|Supply Chain Manager|Supply Chain Planner|Materialplanerare|Produktionsplanerare|Demand Planner|Logistikutvecklare|Speditör|Transportplanerare|Lagerplanerare|Category Manager inköp|Sourcing Manager|Inköpsassistent|Avtalscontroller|Leverantörsutvecklare|Importkoordinator|Exportkoordinator|Tullspecialist|Varuförsörjare|Distributionsplanerare|Inköpschef',
  'Real Estate & Property': 'Fastighetsmäklare|Fastighetsförvaltare|Fastighetstekniker|Fastighetsskötare|Bovärd|Uthyrare|Lokalförvaltare|Projektledare fastighet|Byggprojektledare|Driftchef fastighet|Facility Manager|Energiingenjör fastighet|Fastighetsekonom|Hyresadministratör|Markförvaltare|Exploateringsingenjör|Lantmätare|Besiktningsman|Värderingsman|Fastighetsjurist|Förvaltare bostadsrätt|Teknisk förvaltare|Kommersiell förvaltare|Fastighetsutvecklare|Bostadsuthyrare',
  'Automotive & Aviation': 'Bilmekaniker|Fordonstekniker|Lastbilsmekaniker|Bussmekaniker|Flygmekaniker|Flygtekniker|Pilot|Kabinpersonal|Tågtekniker|Däckmontör|Skadetekniker|Billackerare|Servicerådgivare bil|Reservdelsman|Besiktningstekniker|Fordonselektriker|Diagnostekniker|Motortekniker|Plåtslagare bil|Verkstadschef|Fleet Manager|Fordonsingenjör|Flygledare|Drönarpilot|Trafikflygarinstruktör',
}

const CARE_PRIORITY = [
  'Undersköterska',
  'Stödassistent',
  'Vårdbiträde',
  'Personlig assistent',
  'Boendestödjare',
  'Hemtjänstpersonal',
  'Gruppboende personal',
  'Serviceboende personal',
  'Socialpsykiatri personal',
  'Daglig verksamhet personal',
]

const CARE_SIGNALS = ['vård', 'omsorg', 'lss', 'äldreomsorg', 'undersköterska', 'hemtjänst', 'boendestöd', 'funktionsstöd', 'personlig assistent']

const PROFESSION_OVERRIDES: Record<string, Partial<ProfessionTaxonomyItem>> = {
  'Frontend Developer': {
    keywords: ['react', 'javascript', 'typescript', 'html', 'css', 'frontend'],
    swedishKeywords: ['frontendutvecklare', 'webbutvecklare', 'systemutvecklare'],
    education: ['YH', 'Bachelor', 'Bootcamp'],
    matchSignals: ['skills', 'experience', 'portfolio', 'certificates', 'languages'],
  },
  Undersköterska: {
    keywords: ['undersköterska', 'omvårdnad', 'äldreomsorg', 'hemtjänst', 'vård'],
    swedishKeywords: ['undersköterska', 'vårdbiträde', 'omsorgspersonal'],
    education: ['Vård- och omsorgsprogrammet', 'Komvux', 'Relevant experience'],
  },
  Stödassistent: {
    keywords: ['stödassistent', 'lss', 'funktionsstöd', 'boendestöd', 'bmss'],
    swedishKeywords: ['stödassistent', 'stödpedagog', 'omsorgsassistent'],
    education: ['Vård och omsorg', 'Socialpedagog', 'Relevant experience'],
  },
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function defaultKeywords(profession: string) {
  const normalized = normalize(profession)
  return unique([normalized, ...normalized.split(' ').filter((part) => part.length > 2)])
}

export const LOCAL_PROFESSION_TAXONOMY: ProfessionTaxonomyItem[] = Object.entries(CATEGORY_PROFESSIONS)
  .flatMap(([category, professions]) => professions.split('|').map((profession) => {
    const override = PROFESSION_OVERRIDES[profession] ?? {}
    return {
      category,
      profession,
      keywords: override.keywords ?? defaultKeywords(profession),
      swedishKeywords: override.swedishKeywords ?? [profession.toLowerCase()],
      education: override.education ?? DEFAULT_EDUCATION,
      careerLevel: override.careerLevel ?? DEFAULT_LEVELS,
      jobTypes: override.jobTypes ?? DEFAULT_JOB_TYPES,
      matchSignals: override.matchSignals ?? DEFAULT_SIGNALS,
    }
  }))

function matchesText(text: string, terms: string[]) {
  const normalized = normalize(text)
  return terms.filter((term) => normalized.includes(normalize(term)))
}

function uniqueRecommendations(recommendations: ProfessionRecommendation[]) {
  const seen = new Set<string>()
  return recommendations.filter((recommendation) => {
    const key = normalize(recommendation.profession)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function hasCareProfile(text: string) {
  return matchesText(text, CARE_SIGNALS).length > 0
}

export function recommendLocalProfessions(text: string, limit = 12): ProfessionRecommendation[] {
  const careProfile = hasCareProfile(text)
  const careRecommendations = careProfile
    ? CARE_PRIORITY.map((profession, index) => {
        const item = LOCAL_PROFESSION_TAXONOMY.find((entry) => entry.profession === profession)!
        return {
          profession,
          category: item.category,
          score: 100 - index,
          matchedSignals: ['care-profile-priority'],
        }
      })
    : []
  const scored = LOCAL_PROFESSION_TAXONOMY
    .map((item) => {
      const matchedSignals = matchesText(text, [item.profession, ...item.keywords, ...item.swedishKeywords])
      return {
        profession: item.profession,
        category: item.category,
        score: Math.min(95, matchedSignals.length * 12),
        matchedSignals,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.profession.localeCompare(b.profession, 'sv'))

  return uniqueRecommendations([...careRecommendations, ...scored]).slice(0, limit)
}

export function taxonomySummary() {
  return {
    categories: Object.keys(CATEGORY_PROFESSIONS).length,
    professions: LOCAL_PROFESSION_TAXONOMY.length,
    carePriority: CARE_PRIORITY,
  }
}
