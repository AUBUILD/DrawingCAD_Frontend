import type { ConfigTabProps } from '../../tabs/ConfigTab';
import type { ProjectTabProps } from '../../tabs/ProjectTab';
import type { ConcreteTabProps } from '../../tabs/ConcreteTab';
import type { SteelTabProps } from '../../tabs/SteelTab';
import type { MetradoTabProps } from '../../tabs/MetradoTab';
import type { JsonTabProps } from '../../tabs/JsonTab';
import type { DefaultPreferenceId } from '../../utils';

export interface EditorTabProps {
  defaultPref: DefaultPreferenceId;
  onChangeDefaultPref: (pref: DefaultPreferenceId) => void;
  configTabProps: ConfigTabProps;
  projectTabProps: ProjectTabProps;
  concreteTabProps: ConcreteTabProps;
  steelTabProps: SteelTabProps;
  metradoTabProps: MetradoTabProps;
  jsonTabProps: JsonTabProps;
}
