import { Editor } from './editor/Editor'
import { editingEnabled } from './editing'

export function App() {
  return <Editor editing={editingEnabled} />
}
