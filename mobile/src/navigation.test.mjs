import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommonActions, StackRouter } from '@react-navigation/routers';
import { deviceDetailState, deviceRegisterState } from './navigation.ts';
const router = StackRouter({ initialRouteName: 'Devices' });
const options = { routeNames: ['Intro', 'Devices', 'Details', 'Assign', 'Form', 'Scan', 'MatchScan'], routeParamList: {}, routeGetIdList: {} };
test('registration, scan and label-link completion retain a real back path to Devices', () => {
  let state = router.getInitialState(options);
  state = router.getStateForAction(state, CommonActions.navigate('Scan'), options);
  state = router.getStateForAction(state, CommonActions.reset(deviceDetailState('MOB-001')), options);
  state = router.getRehydratedState(state, options);
  assert.equal(state.routes[state.index].name, 'Details');
  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].name, 'Devices');
  assert.equal(state.routes.length, 1);
});
test('Cancel from registration restores the previous screen', () => {
  let state = router.getInitialState(options);
  state = router.getStateForAction(state, CommonActions.navigate('Form', {}), options);
  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].name, 'Devices');
});
test('completing the introduction removes it from the back stack', () => {
  const introRouter = StackRouter({ initialRouteName: 'Intro' });
  let state = introRouter.getInitialState(options);
  state = introRouter.getStateForAction(state, CommonActions.reset(deviceRegisterState()), options);
  state = introRouter.getRehydratedState(state, options);
  assert.equal(state.routes[0].name, 'Devices');
  assert.equal(state.routes.length, 1);
  assert.equal(introRouter.getStateForAction(state, CommonActions.goBack(), options), null);
});
test('replaying the introduction returns to the same device-register route', () => {
  let state = router.getInitialState(options);
  const registerKey = state.routes[0].key;
  state = router.getStateForAction(state, CommonActions.navigate('Intro', { replay: true }), options);
  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].key, registerKey);
});
