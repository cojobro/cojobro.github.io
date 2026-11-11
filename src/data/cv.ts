import type { Contribution, Education, Honor, Position, Publication, SkillGroup } from './types';

/** The CV, newest first in every list. The CV page and the research page render from here. */

export const education: Education[] = [
  {
    degree: 'Ph.D., Electrical and Computer Engineering',
    institution: 'Vanderbilt University',
    location: 'Nashville, TN',
    period: '2025 – expected 2030',
    details: [
      'Advisor: Jack H. Noble',
      'Dissertation research: digital twin simulation of auditory perception with cochlear implants',
    ],
  },
  {
    degree: 'B.S., Biomedical Engineering',
    institution: 'University of Tennessee, Knoxville',
    location: 'Knoxville, TN',
    period: '2021 – 2024',
    details: [
      'GPA 4.0 / 4.0, summa cum laude',
      'Top Graduate Award (2024) and Outstanding Senior Award (2023), Department of Biomedical Engineering',
    ],
  },
  {
    degree: 'Undergraduate study, Biomedical Engineering',
    institution: 'University of Alabama at Birmingham',
    location: 'Birmingham, AL',
    period: '2019 – 2021',
    details: [],
  },
];

export const positions: Position[] = [
  {
    title: 'Predoctoral Trainee',
    organization: 'Vanderbilt University',
    group: 'Training Program for Innovative Engineering Research in Surgery and Intervention',
    location: 'Nashville, TN',
    period: '2026 – present',
    kind: 'research',
    highlights: [
      'Supported by an NIH Ruth L. Kirschstein NRSA institutional training grant from the National Institute of Biomedical Imaging and Bioengineering (T32EB021937).',
    ],
  },
  {
    title: 'Graduate Research Assistant',
    organization: 'Vanderbilt University',
    group: 'Noble Lab',
    url: 'https://my.vanderbilt.edu/bagl/',
    location: 'Nashville, TN',
    period: '2025 – present',
    kind: 'research',
    highlights: [
      'Build patient-specific digital twins of the implanted auditory nerve on the lab’s CT-based models: ported the lab’s stochastic MATLAB nerve model to PyTorch, verified it against the original and made it differentiable end to end.',
      'Designed convolutional decoders that reconstruct speech from simulated nerve firing, and a decoder that reads any recipient’s twin as an instrument for measuring speech transmission.',
      'Built an end-to-end differentiable encoder in PyTorch that maps audio to electrode selections and pulse currents, optimized per patient and exportable as a hardware-realizable pulse table.',
      'Trained decoders with no target sound, using only whether an automatic speech recognizer understood their output; an independent recognizer’s word identification rose from 24% to 73% across eight twins.',
      'Trained Transformer models that predict STFT phase from log-magnitude spectra, evaluated with MFCC-based metrics.',
    ],
  },
  {
    title: 'Teaching Assistant',
    organization: 'Vanderbilt University',
    group: 'Department of Electrical and Computer Engineering',
    location: 'Nashville, TN',
    period: '2025 – 2026',
    kind: 'teaching',
    highlights: [
      'ECE 4951, Electrical and Computer Engineering Design (Spring 2026).',
      'ECE 2218, Microcontrollers (Fall 2025).',
      'Received the department’s 2026 Best Teaching Assistant Award.',
    ],
  },
  {
    title: 'Research Assistant',
    organization: 'University of Tennessee, Knoxville',
    group: 'SMART Lab (PI: Xiaopeng Zhao)',
    url: 'https://mabe.utk.edu/people/xiaopeng-zhao/',
    location: 'Knoxville, TN',
    period: '2023 – 2025',
    kind: 'research',
    highlights: [
      'Built AI-driven digital-health tools for dementia care: a retrieval-augmented chatbot (LangChain, OpenAI, Pinecone), assistive web applications and social-robot control systems.',
      'Helped build REACH, a social robot and AI system for cancer genetic-risk assessment in rural communities, and demonstrated it at the UT Grand Challenges Summit.',
      'Explored generative AI for simulating patient data.',
    ],
    links: [
      {
        label: 'Recorded project demos (YouTube)',
        href: 'https://www.youtube.com/playlist?list=PLGMzOYW7Z63O3daJ5N_r8RVsR3vmkVfs5',
      },
    ],
  },
  {
    title: 'Tutor',
    organization: 'University of Tennessee, Knoxville',
    group: 'Academic Success Center',
    location: 'Knoxville, TN',
    period: '2022 – 2023',
    kind: 'teaching',
    highlights: [
      'Mentored students in engineering, programming, organic chemistry and calculus.',
      'Planned and led weekly sessions in mathematics, engineering and information science.',
    ],
  },
  {
    title: 'Medical Assistant',
    organization: 'Camai Community Health Center',
    location: 'Naknek, AK',
    period: '2022',
    kind: 'clinical',
    highlights: [
      'Performed phlebotomy, IV medication administration, wound debridement, radiography, suturing and laboratory testing in primary and emergency care.',
      'Served as the clinic’s go-to person for troubleshooting its medical technology.',
    ],
  },
  {
    title: 'Research Assistant',
    organization: 'Lab of Dr. Larry Millet',
    url: 'https://www.researchgate.net/profile/Larry-Millet',
    location: 'Knoxville, TN',
    kind: 'research',
    highlights: [
      'Helped develop an educational bee exhibit at the Knoxville Zoo for a grant-funded bee-conservation project.',
      'Modeled the thermodynamics of natural and managed beehives to compare how well each survives.',
    ],
  },
  {
    title: 'Research Assistant',
    organization: 'University of Alabama at Birmingham',
    group: 'Lab of Prof. Jianyi Zhang, Biomedical Engineering',
    url: 'https://www.uab.edu/engineering/bme/people/faculty/jianyi-jay-zhang',
    location: 'Birmingham, AL',
    kind: 'research',
    highlights: [
      'Performed trichrome staining of heart tissue for studies of myocardial infarction and its treatment.',
      'Helped fabricate engineered cardiac tissue patches and tested their mechanical strength.',
      'Maintained tissue cultures and identified and counted cell types under the microscope.',
    ],
    links: [
      { label: 'Sample of my trichrome staining (PDF)', href: '/files/trichrome-staining.pdf' },
    ],
  },
];

export const honors: Honor[] = [
  {
    year: '2026',
    title: 'Best Teaching Assistant Award',
    organization: 'Department of Electrical and Computer Engineering, Vanderbilt University',
  },
  {
    year: '2024',
    title: 'Top Graduate Award',
    organization: 'Department of Biomedical Engineering, University of Tennessee, Knoxville',
  },
  {
    year: '2024',
    title: 'B.S. summa cum laude, cumulative GPA 4.0 / 4.0',
    organization: 'University of Tennessee, Knoxville',
  },
  {
    year: '2024',
    title: 'UT Grand Challenges Grant, Type 1, awarded to the REACH project',
    organization: 'University of Tennessee',
    note: 'A team award (PI: Xiaopeng Zhao); I was the project’s undergraduate research assistant.',
  },
  {
    year: '2023',
    title: 'Outstanding Senior Award',
    organization: 'Department of Biomedical Engineering, University of Tennessee, Knoxville',
  },
];

export const publications: Publication[] = [
  {
    id: 'brown-2027-spie-speech-transmission',
    kind: 'conference',
    authors: ['Conor J. Brown', 'Jack H. Noble'],
    title:
      'Decoding simulated auditory nerve activity to measure cochlear implant speech transmission from patient-specific neural health',
    venue: 'SPIE Medical Imaging 2027: Image-Guided and Robotic Interventions',
    year: 2027,
    status: 'accepted',
    note: 'Paper 14520-75, for poster presentation in Vancouver, February 2027',
  },
  {
    id: 'brown-2026-phase-transformer-ece-day',
    kind: 'poster',
    authors: ['Conor J. Brown', 'Jack H. Noble'],
    title: 'Transformer model to predict delta phase from log magnitude STFT for CI processing',
    venue: 'Vanderbilt ECE Day, Nashville, TN',
    year: 2026,
    status: 'published',
  },
  {
    id: 'brown-2026-attention-focused-ci-pitch',
    kind: 'presentation',
    authors: ['Conor J. Brown'],
    title: 'Attention-Focused Cochlear Implants',
    venue: 'VISE Technology Pitch, Vanderbilt Institute for Surgery and Engineering, Nashville, TN',
    year: 2026,
    status: 'published',
    note: 'Technology pitch',
  },
  {
    id: 'morris-2025-dementia-caregiver-robotics',
    kind: 'journal',
    authors: [
      'Tyler Morris',
      'Conor Brown',
      'Xiaopeng Zhao',
      'Linda Nichols',
      'Jennifer Martindale-Adams',
      'Sharon Bowland',
      'Wenjun Zhou',
    ],
    title: 'Transforming dementia caregiver support with AI-powered social robotics',
    venue: 'Frontiers in Robotics and AI, vol. 12, 1704313',
    year: 2026,
    status: 'published',
    doi: '10.3389/frobt.2025.1704313',
  },
  {
    id: 'brown-2025-phase-transformer-vise',
    kind: 'poster',
    authors: ['Conor J. Brown', 'Jack H. Noble'],
    title: 'Transformer model to predict delta phase from log magnitude STFT for CI processing',
    venue: 'VISE Annual Surgery, Intervention, and Engineering Symposium, Nashville, TN',
    year: 2025,
    status: 'published',
  },
  {
    id: 'brown-2025-reach-demonstration',
    kind: 'presentation',
    authors: ['Conor J. Brown', 'Tyler Morris'],
    title:
      'REACH: Rural Expansion of Access to Genetic Counseling and Healthcare through AI Innovations',
    venue: 'UT Grand Challenges Summit, Murfreesboro, TN',
    year: 2025,
    status: 'published',
    note: 'Technology demonstration and presentation, February 2025 (PI: Xiaopeng Zhao)',
  },
  {
    id: 'morris-2024-genetic-risk-robots',
    kind: 'conference',
    authors: [
      'Tyler Morris',
      'Conor Brown',
      'Seungwoo An',
      'Jeremiah Augustine',
      'Andrew Ward',
      'Laura Enomoto',
      'Erin Campbell',
      'Xiaopeng Zhao',
    ],
    title: 'Using social robots and AI to perform genetic risk assessment for cancer',
    venue: 'Proceedings of the AAAI Symposium Series, vol. 4(1), pp. 359–366',
    year: 2024,
    status: 'published',
    doi: '10.1609/aaaiss.v4i1.31817',
  },
];

export const contributions: Contribution[] = [
  {
    role: 'Designed and built the social-robot control system used in',
    citation:
      'Yuan F, Bray R, Oliver M, Duzan J, Crane M, Zhao X. A social robot-facilitated performance assessment of self-care skills for people with Alzheimer’s: a preliminary study. International Journal of Social Robotics 16(9):2065–2078, 2024.',
    doi: '10.1007/s12369-024-01174-6',
  },
  {
    role: 'Performed cell counting, tissue culture and trichrome staining for',
    citation:
      'Pretorius D, Kahn-Krell AM, LaBarge WC, Lou X, Zhang J. Engineering of thick human functional myocardium via static stretching and electrical stimulation. iScience 25(3):103824, 2022.',
    doi: '10.1016/j.isci.2022.103824',
  },
  {
    role: 'Performed cell counting, tissue culture and trichrome staining for',
    citation:
      'Pretorius D, Kahn-Krell AM, LaBarge WC, Lou X, Kannappan R, Pollard AE, Fast VG, Berry JL, Eberhardt AW, Zhang J. Fabrication and characterization of a thick, viable bi-layered stem cell-derived surrogate for future myocardial tissue regeneration. Biomedical Materials 16(3), 2021.',
    doi: '10.1088/1748-605X/abc107',
  },
];

export const skills: SkillGroup[] = [
  {
    label: 'Modeling and machine learning',
    items: [
      'PyTorch',
      'Differentiable and stochastic neural modeling',
      'Deep learning (convolutional networks, Transformers)',
      'Neural decoding',
      'Digital signal processing',
      'Finite-difference and finite-element field modeling',
    ],
  },
  {
    label: 'Programming',
    items: [
      'Python',
      'MATLAB',
      'C',
      'Rust',
      'JavaScript',
      'HTML and CSS',
      'CUDA and Metal kernels',
    ],
  },
  {
    label: 'Applied AI',
    items: [
      'Retrieval-augmented generation',
      'LangChain',
      'OpenAI APIs',
      'Pinecone',
      'Social robotics',
    ],
  },
  {
    label: 'Hardware and design',
    items: ['Arduino', 'SolidWorks', 'Fusion 360', 'AutoCAD', '3D printing'],
  },
  {
    label: 'Clinical and laboratory',
    items: [
      'Phlebotomy',
      'IV medication administration',
      'Wound debridement',
      'Radiography',
      'Suturing',
      'Laboratory testing',
      'Tissue culture',
      'Trichrome staining',
    ],
  },
];
