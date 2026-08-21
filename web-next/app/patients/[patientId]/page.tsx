import { PatientRoute } from "@/components/PatientRoute";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <PatientRoute patientId={decodeURIComponent(patientId)} />;
}

export function generateStaticParams() {
  return [
    "aisha_rahman", "elena_petrova", "robert_okafor", "maria_santos",
    "james_wilson", "liam_oconnor", "fatima_al_hassan", "wei_chen",
    "sophia_martinez", "noah_thompson", "olivia_brown",
  ].map((patientId) => ({ patientId }));
}
