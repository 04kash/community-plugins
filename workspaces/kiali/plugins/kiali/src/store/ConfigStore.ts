// defaults to localStorage for web and AsyncStorage for react-native
import {
  INITIAL_ISTIO_CERTS_INFO_STATE,
  INITIAL_ISTIO_STATUS_STATE,
  INITIAL_LOGIN_STATE,
  INITIAL_MESH_TLS_STATE,
  INITIAL_MESSAGE_CENTER_STATE,
  INITIAL_NAMESPACE_STATE,
  INITIAL_STATUS_STATE,
  INITIAL_USER_SETTINGS_STATE,
} from '../reducers';
import { INITIAL_TRACING_STATE } from '../reducers/Tracing';
import { KialiAppState } from './Store';

// Setup the initial state of the Redux store with defaults
// (instead of having things be undefined until they are populated by query)
// Redux 4.0 actually required this
export const initialStore: KialiAppState = {
  authentication: INITIAL_LOGIN_STATE,
  istioStatus: INITIAL_ISTIO_STATUS_STATE,
  istioCertsInfo: INITIAL_ISTIO_CERTS_INFO_STATE,
  meshTLSStatus: INITIAL_MESH_TLS_STATE,
  messageCenter: INITIAL_MESSAGE_CENTER_STATE,
  namespaces: INITIAL_NAMESPACE_STATE,
  tracingState: INITIAL_TRACING_STATE,
  statusState: INITIAL_STATUS_STATE,
  userSettings: INITIAL_USER_SETTINGS_STATE,
  dispatch: {},
};
