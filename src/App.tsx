import { usePlanStore } from './store/planStore'
import LayoutView from './ui/LayoutView'
import VenueEditor from './ui/venue/VenueEditor'

export default function App() {
  const view = usePlanStore(s => s.view)
  return view === 'venue' ? <VenueEditor /> : <LayoutView />
}
