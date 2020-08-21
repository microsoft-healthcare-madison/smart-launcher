import React, {useState, useEffect, useRef} from 'react';

import MainNavigation from './MainNavigation';
import { StorageHelper } from '../util/StorageHelper';
import { 
  Overlay, 
  Classes,
  Switch, 
  Card, 
  Elevation,
  H5, H6,
  Divider,
  IToaster,
  IconName,
  IToasterProps,
  Position,
  Toaster,
  IIntentProps,
  Intent
} from '@blueprintjs/core';
import {IconNames} from '@blueprintjs/icons';

import StandaloneParameters from './StandaloneParameters';
import { LaunchScope } from '../models/LaunchScope';

import FHIR from 'fhirclient';
import { LauncherFhirClient } from '../models/LauncherFhirClient';
import Client from 'fhirclient/lib/Client';
import { CopyHelper } from '../util/CopyHelper';
import DataCard from './DataCard';
import { DataCardInfo } from '../models/DataCardInfo';
import { SingleRequestData, RenderDataAsTypes } from '../models/RequestData';
import { DataCardStatus } from '../models/DataCardStatus';
import { JwtHelper } from '../util/JwtHelper';
import { fhirclient } from 'fhirclient/lib/types';

export interface MainPageProps {}

const _appId:string = 'smart_granular_app';

const _statusAvailable: DataCardStatus = {available: true, complete: false, busy: false};
const _statusNotAvailable: DataCardStatus = {available: false, complete: false, busy: false};
const _statusBusy: DataCardStatus = {available: true, complete: false, busy: true};
const _statusComplete: DataCardStatus = {available: true, complete: true, busy: false};

let _client:Client|undefined = undefined;
let _authTimeoutCheck:any = undefined;

export default function MainPage() {

  const initialLoadRef = useRef<boolean>(true);
  const mainDiv = React.createRef<HTMLDivElement>();
  const toasterRef = useRef<IToaster | null>(null);
  
  const [uiDark, setUiDark] = useState<boolean>(false);
  const [settingsOverlayVisible, setSettingsOverlayVisible] = useState<boolean>(false);

  const [authTimeout, setAuthTimeout] = useState<number>(-1);

  const [aud, setAud] = useState<string>('');
  const [code, setCode] = useState<string>('');

  const authCardInfo:DataCardInfo = {
    id: 'auth-info-card',
    heading: 'Authorization Information',
    description: '',
    optional: false,
  }
  const [authCardData, setAuthCardData] = useState<SingleRequestData[]>([]);
  const [authCardStatus, setAuthCardStatus] = useState<DataCardStatus>(_statusAvailable);

  useEffect(() => {
    if (initialLoadRef.current) {
      if (localStorage.getItem('uiDark') === 'true') {
        setUiDark(true);
      } else if (sessionStorage.getItem('uiDark') === 'true') {
        setUiDark(true);
      }

      var url = new URL(window.location.href);
  
      getFromQueryOrStorage(url, 'aud', setAud, true);
  
      if (getFromQueryOrStorage(url, 'code', setCode, false) !== '') {
        FHIR.oauth2.ready(onAuthReady, onAuthError);
      }

      initialLoadRef.current = false;
    }
  }, []);

  function toggleUiTheme() {
    setUiDark(!uiDark);
  };
  useEffect(() => {
    if (!mainDiv) {
      return;
    }

    if (uiDark) {
      if (mainDiv.current!.className !== 'bp3-dark') {
        mainDiv.current!.className = 'bp3-dark';
      }
      if (document.body.className !== 'body-dark') {
        document.body.className = 'body-dark';
      }

      if (StorageHelper.isLocalStorageAvailable) {
        localStorage.setItem('uiDark', (uiDark).toString());
      } else {
        sessionStorage.setItem('uiDark', (uiDark).toString());
      }

      return;
    }

    if (mainDiv.current!.className === 'bp3-dark') {
      mainDiv.current!.className = '';
    }
    if (document.body.className === 'body-dark') {
      document.body.className = '';
    }

    if (StorageHelper.isLocalStorageAvailable) {
      localStorage.setItem('uiDark', (uiDark).toString());
    } else {
      sessionStorage.setItem('uiDark', (uiDark).toString());
    }
    
  }, [uiDark, mainDiv]);

  function toggleSettingsVisible() {
    setSettingsOverlayVisible(!settingsOverlayVisible);
  }

  function getFromQueryOrStorage(url:URL, key:string, setter:((val:string) => void), save:boolean) {
    if (url.searchParams.has(key)) {
      let val:string = url.searchParams.get(key) ?? '';

      if (save) {
        sessionStorage.setItem(key, val);
      }

      if (setter !== undefined) {
        setter(val);
      }
      return(val);
    }
    
    let val = sessionStorage.getItem(key);
    if (val) {
      setter(val);
      return(val);
    }

    return(undefined);
  }

  function showToastMessage(message:string, iconName?:IconName, timeout?:number, intent?:Intent) {
    let toaster:IToaster = getOrCreateToaster();
    toaster.show({message: message, icon: iconName, timeout: timeout, intent:intent});
  }

  function getOrCreateToaster():IToaster {
    if (!toasterRef.current) {
      // **** configure our toaster display ****

      var toasterProps: IToasterProps = {
        autoFocus: false,
        canEscapeKeyClear: true,
        position: Position.TOP,
      }

      // **** static create the toaster on the DOM ****
      toasterRef.current = Toaster.create(toasterProps, document.body);
    }

    return toasterRef.current;
  }

  function copyToClipboard(message: string, toast?: string) {
    const success = CopyHelper.copyToClipboard(message);

    if ((success) && (toast)) {
      showToastMessage(`${toast} Copied!`, IconNames.CLIPBOARD, 500);
    }

    if ((!success) && (toast)) {
      showToastMessage('Failed to copy!', IconNames.WARNING_SIGN, 1000);
    }
  }

  function checkAuthTimeout() {
    _authTimeoutCheck = setTimeout(checkAuthTimeout, 10000);

    let now:number = new Date().getTime();

    if (authTimeout < now) {
      return;
    }

    if ((now + 10000) > authTimeout) {
      showToastMessage(
        `Auth token will timeout in ${(authTimeout - now) / 1000} seconds`,
        IconNames.TIME,
        2000,
        Intent.WARNING);
    }
  }
  
  function startAuth(requestedScopes:LaunchScope) {
    if (!aud) {
      showToastMessage('Standalone launch requires an Audience!', IconNames.ERROR);
      return;
    }

    let scopes:string = requestedScopes.getScopes();
    sessionStorage.setItem(`r_${aud}`, scopes);

    FHIR.oauth2.authorize({
      client_id: _appId,
      scope: scopes,
      iss: aud,
    });
  }

  function refreshAuth(requestedScopes?:LaunchScope) {
    if (!_client) {
      showToastMessage('Refreshing requires an authorication token!', IconNames.ERROR, undefined, Intent.DANGER);
      return;
    }

    _client.refresh()
      .then((refreshedState:fhirclient.ClientState) => {
        buildAuthCardDataSuccess(true);
      })
      .catch((reason:any) => {
        buildAuthCardDataError(true, reason);
      });
  }

  function buildAuthCardDataError(isRenewal:boolean, error:any) {
    let now:Date = new Date();

    let id:string;
    let name:string;

    if (isRenewal) {
      id = `refresh_${authCardData.length}`;
      name = `Token Refresh #${authCardData.length} - ${now.toLocaleTimeString()}`;
    } else {
      id = 'initial_auth';
      name = `SMART Launch - ${now.toLocaleString()}`;
    }

    let url:string = _client?.state.serverUrl.replace(/fhir$/, 'auth/token') ?? aud;

    let data:SingleRequestData = {
      id: id,
      name: name,
      requestUrl: url + '\n<<< ' + now.toLocaleString(),
      responseData: JSON.stringify(error, null, 2),
      responseDataType: RenderDataAsTypes.Error,
    }

    if (isRenewal) {
      let updatedData:SingleRequestData[] = authCardData.slice();
      updatedData.push(data);
      setAuthCardData(updatedData);
  
      showToastMessage('Token renewal failed!', IconNames.ERROR, undefined, Intent.DANGER);
    } else {
      setAuthCardData([data]);
  
      showToastMessage('Authorization failed!', IconNames.ERROR, undefined, Intent.DANGER);
    }
  }

  function buildAuthCardDataSuccess(isRenewal:boolean, request?:any) {
    let now:Date = new Date();
    let expires:number = _client?.state.tokenResponse?.expires_in ?? -1;
    
    if (expires < 0) {
      setAuthTimeout(-1);
    } else {
      setAuthTimeout(now.getTime() + expires);

      if (_authTimeoutCheck) {
        window.clearTimeout(_authTimeoutCheck);
        _authTimeoutCheck = undefined;
      }
      _authTimeoutCheck = setTimeout(checkAuthTimeout, 10000);
    }

    let id:string;
    let name:string;

    if (isRenewal) {
      id = `refresh_${authCardData.length}`;
      name = `Token Refresh #${authCardData.length} - ${now.toLocaleTimeString()}`;
    } else {
      id = 'initial_auth';
      name = `SMART Launch - ${now.toLocaleString()}`;
    }

    let extended:Map<string,string> = new Map([
      ['ID Token', JwtHelper.getDecodedTokenString(_client?.state.tokenResponse?.id_token)],
      ['Refresh Token', JwtHelper.getDecodedTokenString(_client?.state.tokenResponse?.refresh_token)]
    ]);

    let url:string = _client?.state.serverUrl.replace(/fhir$/, 'auth/token') ?? aud;

    let data:SingleRequestData = {
      id: id,
      name: name,
      requestUrl: url,
      responseData: JSON.stringify(_client!.state.tokenResponse, null, 2),
      responseDataType: RenderDataAsTypes.JSON,
      info: `Processed at: ${now.toLocaleString()}`,
      infoDataType: RenderDataAsTypes.Text,
      extended: extended,
      extendedDataType: RenderDataAsTypes.JSON,
    }

    if (request) {
      data.requestData = JSON.stringify(request, null, 2);
      data.requestDataType = RenderDataAsTypes.JSON;
    }

    let updatedData:SingleRequestData[] = authCardData.slice();
    updatedData.push(data);
    setAuthCardData(updatedData);

    if (isRenewal) {
      let updatedData:SingleRequestData[] = authCardData.slice();
      updatedData.push(data);
      setAuthCardData(updatedData);
    } else {
      setAuthCardData([data]);
    }
  }

  function onAuthReady(client:Client) {
    // log the client in the console for those who want to inspect it
    console.log('SMART Ready:', client);
    _client = client;

    let currentAud:string = sessionStorage.getItem('aud') ?? '';
    let scopes:string = sessionStorage.getItem(`r_${currentAud}`) ?? '';

    // TODO(gino): remove during normal use - leaving for dev testing
    // if (scopes) {
    //   sessionStorage.removeItem(`r_${currentAud}`);
    // }

    let request:any = {
      client_id: _appId,
      scopes: scopes,
      iss: currentAud,
    }

    buildAuthCardDataSuccess(false, request);
  }

  function onAuthError(error:Error) {
    buildAuthCardDataError(false, error);
  }

  function setAudAndSave(value:string) {
    sessionStorage.setItem('aud', value);
    setAud(value);
  }

  return (
    <div ref={mainDiv}>
      <MainNavigation 
        toggleSettingsVisible={toggleSettingsVisible}
        />
      <Overlay
        isOpen={settingsOverlayVisible}
        onClose={toggleSettingsVisible}
        className={Classes.OVERLAY_SCROLL_CONTAINER}
        usePortal={false}
        autoFocus={true}
        hasBackdrop={true}
        canEscapeKeyClose={true}
        canOutsideClickClose={true}
        >
        <Card
          className='centered'
          interactive={false}
          elevation={Elevation.TWO}
          >
          <H5>Settings</H5>
          <Divider />
          <H6>UI</H6>
          <Switch
            checked={uiDark}
            label='Use Dark Theme'
            onChange={() => toggleUiTheme()}
            />
        </Card>
      </Overlay>
      <StandaloneParameters
        isUiDark={uiDark}
        aud={aud}
        setAud={setAudAndSave}
        startAuth={startAuth}
        refreshAuth={refreshAuth}
        toaster={showToastMessage}
        copyToClipboard={copyToClipboard}
        />
      <DataCard
        info={authCardInfo}
        data={authCardData}
        status={authCardStatus}
        parentProps={{
          isUiDark: uiDark,
          aud: aud,
          setAud: setAudAndSave,
          startAuth: startAuth,
          refreshAuth: refreshAuth,
          toaster: showToastMessage,
          copyToClipboard: copyToClipboard,
        }}
        />
      {/* <div id='mainContent'>
      </div> */}
    </div>
  );
}