import {
  PLATFORMS,
  type GlobalSettings,
  type Platform,
} from '../board'

interface TaskLibraryEditorProps {
  settings: GlobalSettings
  onTaskTypeHoursChange: (taskTypeId: string, estimatedHours: number) => void
  onAdNamingTemplateChange: (platform: Platform, template: string) => void
}

export function TaskLibraryEditor({
  settings,
  onTaskTypeHoursChange,
  onAdNamingTemplateChange,
}: TaskLibraryEditorProps) {
  const sortedTaskTypes = settings.taskLibrary.slice().sort((left, right) => left.order - right.order)

  return (
    <div className="settings-block">
      <div className="nested-settings-title">Task Types</div>
      <div className="settings-table full-table">
        <div className="settings-row settings-head task-library-head">
          <span>Type</span>
          <span>Family</span>
          <span>Icon</span>
          <span>Default hours</span>
        </div>
        {sortedTaskTypes.map((taskType) => (
          <div key={taskType.id} className="settings-row task-library-row">
            <strong>{taskType.name}</strong>
            <span>{taskType.category}</span>
            <span aria-hidden="true">{taskType.icon}</span>
            <input
              type="number"
              min={1}
              step={0.5}
              aria-label={`Default hours for ${taskType.name}`}
              value={taskType.estimatedHours}
              onChange={(event) =>
                onTaskTypeHoursChange(taskType.id, Math.max(1, Number(event.target.value) || 1))
              }
            />
          </div>
        ))}
      </div>

      <div className="nested-settings-title">Ad Naming Templates</div>
      <div className="settings-stack">
        {PLATFORMS.map((platform) => (
          <label key={platform} className="quick-create-field full-width">
            <span>{platform}</span>
            <input
              value={settings.adNamingTemplates[platform]}
              onChange={(event) => onAdNamingTemplateChange(platform, event.target.value)}
              placeholder="{title} | {id}"
            />
          </label>
        ))}
      </div>
      <p className="muted-copy">
        Use placeholders like <code>{'{id}'}</code>, <code>{'{title}'}</code>,{' '}
        <code>{'{angle}'}</code>, <code>{'{audience}'}</code>, and{' '}
        <code>{'{funnelStage}'}</code>. Empty sections are removed automatically.
      </p>
    </div>
  )
}
