import { memo, useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import { useParams, useLocation, useHistory } from 'react-router-dom';
import { get } from 'lodash';
import { request, useGlobalContext } from 'strapi-helper-plugin';
import PropTypes from 'prop-types';
import { createDefaultForm, getTrad, removePasswordFieldsFromData } from '../../utils';
import pluginId from '../../pluginId';
import { getRequestUrl } from './utils';
import reducer, { initialState } from './reducer';

const CollectionTypeWrapper = ({ allLayoutData, children, slug }) => {
  const { emitEvent } = useGlobalContext();
  const { push, replace } = useHistory();
  const { state } = useLocation();
  const { id } = useParams();
  const [
    { componentsDataStructure, contentTypeDataStructure, data, isLoading, status },
    dispatch,
  ] = useReducer(reducer, initialState);

  const emitEventRef = useRef(emitEvent);

  // Here in case of a 403 response when fetching data we will either redirect to the previous page
  // Or to the homepage if there's no state in the history stack
  const from = get(state, 'from', '/');

  const isCreatingEntry = id === 'create';

  const fetchURL = useMemo(() => {
    if (isCreatingEntry) {
      return null;
    }

    return getRequestUrl(`${slug}/${id}`);
  }, [slug, id, isCreatingEntry]);

  const cleanReceivedDataFromPasswords = useCallback(
    data => {
      return removePasswordFieldsFromData(
        data,
        allLayoutData.contentType,
        allLayoutData.components
      );
    },
    [allLayoutData.components, allLayoutData.contentType]
  );

  // SET THE DEFAULT LAYOUT the effect is applied when the slug changes
  useEffect(() => {
    const componentsDataStructure = Object.keys(allLayoutData.components).reduce((acc, current) => {
      acc[current] = createDefaultForm(
        get(allLayoutData, ['components', current, 'schema', 'attributes'], {}),
        allLayoutData.components
      );

      return acc;
    }, {});

    const contentTypeDataStructure = createDefaultForm(
      allLayoutData.contentType.schema.attributes,
      allLayoutData.components
    );

    dispatch({
      type: 'SET_DATA_STRUCTURES',
      componentsDataStructure,
      contentTypeDataStructure,
    });
  }, [allLayoutData]);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    const getData = async signal => {
      dispatch({ type: 'GET_DATA' });

      try {
        const data = await request(fetchURL, { method: 'GET', signal });

        dispatch({
          type: 'GET_DATA_SUCCEEDED',
          data: cleanReceivedDataFromPasswords(data),
        });
      } catch (err) {
        console.error(err);
        const resStatus = get(err, 'response.status', null);

        if (resStatus === 404) {
          push(from);

          return;
        }

        // Not allowed to read a document
        if (resStatus === 403) {
          strapi.notification.info(getTrad('permissions.not-allowed.update'));

          push(from);
        }
      }
    };

    if (fetchURL) {
      getData(signal);
    } else {
      dispatch({ type: 'INIT_FORM' });
    }

    return () => {
      abortController.abort();
    };
  }, [fetchURL, push, from, cleanReceivedDataFromPasswords]);

  const displayErrors = useCallback(err => {
    const errorPayload = err.response.payload;
    console.error(errorPayload);

    let errorMessage = get(errorPayload, ['message'], 'Bad Request');

    // TODO handle errors correctly when back-end ready
    if (Array.isArray(errorMessage)) {
      errorMessage = get(errorMessage, ['0', 'messages', '0', 'id']);
    }

    if (typeof errorMessage === 'string') {
      strapi.notification.error(errorMessage);
    }
  }, []);

  const onPost = useCallback(
    async (formData, trackerProperty) => {
      // const formData = createFormData(data);
      const endPoint = getRequestUrl(slug);

      try {
        // Show a loading button in the EditView/Header.js && lock the app => no navigation
        dispatch({ type: 'SET_STATUS', status: 'submit-pending' });

        const response = await request(
          endPoint,
          { method: 'POST', headers: {}, body: formData },
          false,
          false
        );

        emitEventRef.current('didCreateEntry', trackerProperty);
        strapi.notification.success(getTrad('success.record.save'));

        dispatch({ type: 'SUBMIT_SUCCEEDED', data: response });
        dispatch({ type: 'SET_STATUS', status: 'submit-pending' });

        replace(`/plugins/${pluginId}/collectionType/${slug}/${response.id}`);
      } catch (err) {
        displayErrors(err);
        emitEventRef.current('didNotCreateEntry', { error: err, trackerProperty });
        // Enable navigation and remove loaders
        dispatch({ type: 'SET_STATUS', status: 'resolved' });
      }
    },
    [displayErrors, replace, slug]
  );

  const onPut = useCallback(
    async (formData, trackerProperty) => {
      const endPoint = getRequestUrl(`${slug}/${id}`);

      try {
        // Show a loading button in the EditView/Header.js && lock the app => no navigation
        dispatch({ type: 'SET_STATUS', status: 'submit-pending' });
        emitEventRef.current('willEditEntry', trackerProperty);

        const response = await request(
          endPoint,
          { method: 'PUT', headers: {}, body: formData },
          false,
          false
        );

        emitEventRef.current('didEditEntry', { trackerProperty });

        dispatch({ type: 'SUBMIT_SUCCEEDED', data: cleanReceivedDataFromPasswords(response) });
        // Enable navigation and remove loaders
        dispatch({ type: 'SET_STATUS', status: 'resolved' });
      } catch (err) {
        displayErrors(err);

        emitEventRef.current('didNotEditEntry', { error: err, trackerProperty });
        // Enable navigation and remove loaders
        dispatch({ type: 'SET_STATUS', status: 'resolved' });
      }
    },
    [cleanReceivedDataFromPasswords, displayErrors, slug, id]
  );

  return children({
    componentsDataStructure,
    contentTypeDataStructure,
    data,
    isCreatingEntry,
    isLoadingForData: isLoading,
    onPost,
    onPut,
    status,
  });
};

CollectionTypeWrapper.propTypes = {
  allLayoutData: PropTypes.shape({
    components: PropTypes.object.isRequired,
    contentType: PropTypes.object.isRequired,
  }).isRequired,
  // allowedActions: PropTypes.object.isRequired,
  children: PropTypes.func.isRequired,
  slug: PropTypes.string.isRequired,
};

export default memo(CollectionTypeWrapper);
